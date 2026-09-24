import {
    assetDetailSchema,
    assetListResponseSchema,
    assetSummarySchema,
    type AddAssetIdentifierRequest,
    type AssetDetail,
    type AssetListQuery,
    type AssetListResponse,
    type AssetSummary,
    type AssetVersionRequest,
    type ChangeAssetIdentifierRequest,
    type CreateAssetRequest,
    type SetAssetLifecycleRequest,
    type UpdateAssetRequest,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import { assetIdentifiers, assets, type Asset } from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

import { recordAuditEvent } from "../audit/audit.service";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { OrganizationAuthorizationService } from "../auth/organization-authorization.service";
import { ContractException } from "../http/contracts";
import {
    decodeRegistryCursor,
    encodeRegistryCursor,
    registryFilterKey,
    searchPattern,
} from "../registry/search";
import { recordAssetHistory, type AssetHistoryEventType } from "./asset-history.writer";
import { advanceAssetVersion, getAsset } from "./asset-transaction";

function summary(asset: Asset): AssetSummary {
    return assetSummarySchema.parse({
        id: asset.id,
        displayName: asset.displayName,
        description: asset.description,
        manufacturer: asset.manufacturer,
        model: asset.model,
        classification: asset.classification,
        lifecycle: asset.lifecycle,
        status: asset.status,
        version: asset.version,
        createdAt: asset.createdAt.toISOString(),
        updatedAt: asset.updatedAt.toISOString(),
        archivedAt: asset.archivedAt?.toISOString() ?? null,
    });
}

function normalizeIdentifier(value: string): string {
    const normalized = value
        .normalize("NFKC")
        .toUpperCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
    if (!normalized) throw new ContractException("INVALID_IDENTIFIER", 400);
    return normalized;
}

function transitionAllowed(current: Asset["lifecycle"], next: Asset["lifecycle"]): boolean {
    if (current === next || current === "retired") return false;
    if (current === "registered") return next !== "registered";
    return next === "in_service" || next === "out_of_service" || next === "retired";
}

@Injectable()
export class AssetManagementService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    async create(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: CreateAssetRequest,
    ): Promise<AssetDetail> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.write"],
            async (transaction) => {
                const identifiers = input.identifiers.map((identifier) => ({
                    type: identifier.type.toLowerCase(),
                    originalValue: identifier.originalValue,
                    normalizedValue: normalizeIdentifier(identifier.originalValue),
                }));
                const [asset] = await transaction
                    .insert(assets)
                    .values({
                        organizationId,
                        displayName: input.displayName,
                        description: input.description ?? null,
                        manufacturer: input.manufacturer ?? null,
                        model: input.model ?? null,
                        classification: input.classification ?? null,
                        lifecycle: input.lifecycle,
                    })
                    .returning();
                if (identifiers.length) {
                    await transaction.insert(assetIdentifiers).values(
                        identifiers.map((identifier) => ({
                            organizationId,
                            assetId: asset!.id,
                            ...identifier,
                        })),
                    );
                }
                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "asset.created",
                    resourceType: "asset",
                    resourceId: asset!.id,
                });
                await recordAssetHistory(transaction, {
                    organizationId,
                    assetId: asset!.id,
                    actorUserId: principal.user.id,
                    aggregateVersion: asset!.version,
                    event: "asset_created",
                    payload: { identifierCount: identifiers.length },
                });
                return this.getInTransaction(transaction, organizationId, asset!.id);
            },
        );
    }

    get(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
    ): Promise<AssetDetail> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.read"],
            (transaction) => this.getInTransaction(transaction, organizationId, assetId),
        );
    }

    async getInTransaction(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        assetId: string,
    ): Promise<AssetDetail> {
        const asset = await getAsset(transaction, organizationId, assetId);
        const identifiers = await transaction
            .select()
            .from(assetIdentifiers)
            .where(
                and(
                    eq(assetIdentifiers.organizationId, organizationId),
                    eq(assetIdentifiers.assetId, assetId),
                ),
            )
            .orderBy(assetIdentifiers.createdAt, assetIdentifiers.id);
        const candidates = await transaction
            .select({
                id: assets.id,
                displayName: assets.displayName,
                matchedType: assetIdentifiers.type,
            })
            .from(assetIdentifiers)
            .innerJoin(
                assets,
                and(
                    eq(assets.organizationId, assetIdentifiers.organizationId),
                    eq(assets.id, assetIdentifiers.assetId),
                ),
            )
            .where(
                and(
                    eq(assetIdentifiers.organizationId, organizationId),
                    ne(assetIdentifiers.assetId, assetId),
                    eq(assetIdentifiers.status, "active"),
                    sql`EXISTS (
                        SELECT 1 FROM asset_identifiers own
                        WHERE own.organization_id = ${organizationId}::uuid
                          AND own.asset_id = ${assetId}::uuid
                          AND own.status = 'active'
                          AND own.type = ${assetIdentifiers.type}
                          AND own.normalized_value = ${assetIdentifiers.normalizedValue}
                    )`,
                ),
            )
            .groupBy(assets.id, assets.displayName, assetIdentifiers.type)
            .orderBy(assets.displayName, assets.id, assetIdentifiers.type)
            .limit(20);
        return assetDetailSchema.parse({
            ...summary(asset),
            identifiers: identifiers.map((identifier) => ({
                id: identifier.id,
                type: identifier.type,
                originalValue: identifier.originalValue,
                normalizedValue: identifier.normalizedValue,
                status: identifier.status,
                retiredAt: identifier.retiredAt?.toISOString() ?? null,
            })),
            duplicateCandidates: candidates,
        });
    }

    async list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: AssetListQuery,
    ): Promise<AssetListResponse> {
        const filters = registryFilterKey({
            name: query.name,
            q: query.q,
            status: query.status,
            lifecycle: query.lifecycle,
            manufacturer: query.manufacturer,
            model: query.model,
            classification: query.classification,
            sort: query.sort,
        });
        const cursor = query.cursor
            ? decodeRegistryCursor(query.cursor, filters, "INVALID_ASSET_CURSOR")
            : undefined;
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.read"],
            async (transaction) => {
                const normalizedName = sql`lower(${assets.displayName})`;
                const conditions = [eq(assets.organizationId, organizationId)];
                if (query.status) conditions.push(eq(assets.status, query.status));
                if (query.lifecycle) conditions.push(eq(assets.lifecycle, query.lifecycle));
                if (query.manufacturer)
                    conditions.push(
                        sql`lower(${assets.manufacturer}) LIKE ${searchPattern(query.manufacturer)} ESCAPE ${"\\"}`,
                    );
                if (query.model)
                    conditions.push(
                        sql`lower(${assets.model}) LIKE ${searchPattern(query.model)} ESCAPE ${"\\"}`,
                    );
                if (query.classification)
                    conditions.push(
                        sql`lower(${assets.classification}) LIKE ${searchPattern(query.classification)} ESCAPE ${"\\"}`,
                    );
                if (query.name) {
                    conditions.push(
                        sql`${normalizedName} LIKE ${searchPattern(query.name)} ESCAPE ${"\\"}`,
                    );
                }
                if (query.q) {
                    const pattern = searchPattern(query.q);
                    conditions.push(sql`(
                        ${normalizedName} LIKE ${pattern} ESCAPE ${"\\"}
                        OR lower(coalesce(${assets.manufacturer}, '')) LIKE ${pattern} ESCAPE ${"\\"}
                        OR lower(coalesce(${assets.model}, '')) LIKE ${pattern} ESCAPE ${"\\"}
                        OR lower(coalesce(${assets.classification}, '')) LIKE ${pattern} ESCAPE ${"\\"}
                        OR EXISTS (
                            SELECT 1 FROM asset_identifiers identifier
                            WHERE identifier.organization_id = ${organizationId}::uuid
                              AND identifier.asset_id = ${assets.id}
                              AND identifier.status = 'active'
                              AND (lower(identifier.original_value) LIKE ${pattern} ESCAPE ${"\\"}
                                   OR lower(identifier.normalized_value) LIKE ${pattern} ESCAPE ${"\\"})
                        )
                        OR EXISTS (
                            SELECT 1 FROM asset_relationships relationship
                            LEFT JOIN parties target_party
                              ON target_party.organization_id = relationship.organization_id
                             AND target_party.id = relationship.party_id
                            LEFT JOIN organization_sites target_site
                              ON target_site.organization_id = relationship.organization_id
                             AND target_site.id = relationship.site_id
                            LEFT JOIN party_addresses target_address
                              ON target_address.organization_id = relationship.organization_id
                             AND target_address.id = relationship.party_address_id
                            WHERE relationship.organization_id = ${organizationId}::uuid
                              AND relationship.asset_id = ${assets.id}
                              AND relationship.effective_to IS NULL
                              AND relationship.superseded_at IS NULL
                              AND (lower(coalesce(target_party.display_name, '')) LIKE ${pattern} ESCAPE ${"\\"}
                                   OR lower(coalesce(target_site.name, '')) LIKE ${pattern} ESCAPE ${"\\"}
                                   OR lower(coalesce(target_address.line_1, '')) LIKE ${pattern} ESCAPE ${"\\"}
                                   OR lower(coalesce(target_address.locality, '')) LIKE ${pattern} ESCAPE ${"\\"}
                                   OR lower(coalesce(relationship.location_description, '')) LIKE ${pattern} ESCAPE ${"\\"})
                        )
                    )`);
                }
                if (cursor) {
                    if (cursor.sort !== query.sort)
                        throw new ContractException("INVALID_ASSET_CURSOR", 400);
                    conditions.push(
                        query.sort === "updated_desc"
                            ? sql`(${assets.updatedAt}, ${assets.id}) < (${new Date(cursor.key)}, ${cursor.id}::uuid)`
                            : query.sort === "name_desc"
                              ? sql`(${normalizedName}, ${assets.id}) < (${cursor.key}, ${cursor.id}::uuid)`
                              : sql`(${normalizedName}, ${assets.id}) > (${cursor.key}, ${cursor.id}::uuid)`,
                    );
                }
                const rows = await transaction
                    .select()
                    .from(assets)
                    .where(and(...conditions))
                    .orderBy(
                        query.sort === "updated_desc"
                            ? desc(assets.updatedAt)
                            : query.sort === "name_desc"
                              ? desc(normalizedName)
                              : asc(normalizedName),
                        query.sort === "name_asc" ? asc(assets.id) : desc(assets.id),
                    )
                    .limit(query.limit + 1);
                const page = rows.slice(0, query.limit);
                const last = page.at(-1);
                return assetListResponseSchema.parse({
                    data: page.map(summary),
                    nextCursor:
                        rows.length > query.limit && last
                            ? encodeRegistryCursor({
                                  key:
                                      query.sort === "updated_desc"
                                          ? last.updatedAt.toISOString()
                                          : last.displayName.toLowerCase(),
                                  id: last.id,
                                  sort: query.sort,
                                  filters,
                              })
                            : null,
                });
            },
        );
    }

    update(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        input: UpdateAssetRequest,
    ): Promise<AssetDetail> {
        return this.mutate(
            principal,
            organizationId,
            assetId,
            input.expectedVersion,
            "asset.updated",
            async (transaction) => {
                await transaction
                    .update(assets)
                    .set({
                        ...(input.displayName !== undefined
                            ? { displayName: input.displayName }
                            : {}),
                        ...(input.description !== undefined
                            ? { description: input.description }
                            : {}),
                        ...(input.manufacturer !== undefined
                            ? { manufacturer: input.manufacturer }
                            : {}),
                        ...(input.model !== undefined ? { model: input.model } : {}),
                        ...(input.classification !== undefined
                            ? { classification: input.classification }
                            : {}),
                    })
                    .where(and(eq(assets.organizationId, organizationId), eq(assets.id, assetId)));
            },
        );
    }

    setLifecycle(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        input: SetAssetLifecycleRequest,
    ): Promise<AssetDetail> {
        return this.mutate(
            principal,
            organizationId,
            assetId,
            input.expectedVersion,
            "asset.lifecycle_changed",
            async (transaction, current) => {
                if (!transitionAllowed(current.lifecycle, input.lifecycle))
                    throw new ContractException("ASSET_LIFECYCLE_CONFLICT", 409);
                await transaction
                    .update(assets)
                    .set({ lifecycle: input.lifecycle })
                    .where(and(eq(assets.organizationId, organizationId), eq(assets.id, assetId)));
                return { from: current.lifecycle, to: input.lifecycle };
            },
        );
    }

    setArchived(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        input: AssetVersionRequest,
        archived: boolean,
    ): Promise<AssetDetail> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.archive"],
            async (transaction) => {
                const current = await getAsset(transaction, organizationId, assetId);
                if (current.version !== input.expectedVersion)
                    throw new ContractException("VERSION_CONFLICT", 409);
                if ((current.status === "archived") === archived)
                    throw new ContractException("ASSET_ARCHIVE_CONFLICT", 409);
                const [updated] = await transaction
                    .update(assets)
                    .set({
                        status: archived ? "archived" : "active",
                        archivedAt: archived ? new Date() : null,
                        version: sql`${assets.version} + 1`,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(assets.organizationId, organizationId),
                            eq(assets.id, assetId),
                            eq(assets.version, input.expectedVersion),
                        ),
                    )
                    .returning();
                if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: archived ? "asset.archived" : "asset.restored",
                    resourceType: "asset",
                    resourceId: assetId,
                });
                await recordAssetHistory(transaction, {
                    organizationId,
                    assetId,
                    actorUserId: principal.user.id,
                    aggregateVersion: updated.version,
                    event: archived ? "asset_archived" : "asset_restored",
                });
                return this.getInTransaction(transaction, organizationId, assetId);
            },
        );
    }

    addIdentifier(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        input: AddAssetIdentifierRequest,
    ): Promise<AssetDetail> {
        const normalizedValue = normalizeIdentifier(input.originalValue);
        return this.mutate(
            principal,
            organizationId,
            assetId,
            input.expectedVersion,
            "asset.identifier_added",
            async (transaction) => {
                const [identifier] = await transaction
                    .insert(assetIdentifiers)
                    .values({
                        organizationId,
                        assetId,
                        type: input.type.toLowerCase(),
                        originalValue: input.originalValue,
                        normalizedValue,
                    })
                    .returning({ id: assetIdentifiers.id });
                return { identifierId: identifier!.id, type: input.type.toLowerCase() };
            },
        );
    }

    changeIdentifier(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        identifierId: string,
        input: ChangeAssetIdentifierRequest,
    ): Promise<AssetDetail> {
        const normalizedValue = normalizeIdentifier(input.originalValue);
        return this.mutate(
            principal,
            organizationId,
            assetId,
            input.expectedVersion,
            "asset.identifier_changed",
            async (transaction) => {
                const [retired] = await transaction
                    .update(assetIdentifiers)
                    .set({ status: "retired", retiredAt: new Date(), updatedAt: new Date() })
                    .where(
                        and(
                            eq(assetIdentifiers.organizationId, organizationId),
                            eq(assetIdentifiers.assetId, assetId),
                            eq(assetIdentifiers.id, identifierId),
                            eq(assetIdentifiers.status, "active"),
                        ),
                    )
                    .returning();
                if (!retired) throw new ContractException("ASSET_IDENTIFIER_NOT_FOUND", 404);
                const [replacement] = await transaction
                    .insert(assetIdentifiers)
                    .values({
                        organizationId,
                        assetId,
                        type: input.type.toLowerCase(),
                        originalValue: input.originalValue,
                        normalizedValue,
                    })
                    .returning({ id: assetIdentifiers.id });
                return {
                    retiredIdentifierId: identifierId,
                    replacementIdentifierId: replacement!.id,
                };
            },
        );
    }

    retireIdentifier(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        identifierId: string,
        input: AssetVersionRequest,
    ): Promise<AssetDetail> {
        return this.mutate(
            principal,
            organizationId,
            assetId,
            input.expectedVersion,
            "asset.identifier_retired",
            async (transaction) => {
                const [retired] = await transaction
                    .update(assetIdentifiers)
                    .set({ status: "retired", retiredAt: new Date(), updatedAt: new Date() })
                    .where(
                        and(
                            eq(assetIdentifiers.organizationId, organizationId),
                            eq(assetIdentifiers.assetId, assetId),
                            eq(assetIdentifiers.id, identifierId),
                            eq(assetIdentifiers.status, "active"),
                        ),
                    )
                    .returning();
                if (!retired) throw new ContractException("ASSET_IDENTIFIER_NOT_FOUND", 404);
                return { identifierId };
            },
        );
    }

    private mutate(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        expectedVersion: number,
        action:
            | "asset.updated"
            | "asset.lifecycle_changed"
            | "asset.identifier_added"
            | "asset.identifier_changed"
            | "asset.identifier_retired",
        operation: (
            transaction: ArdenfoldTransaction,
            current: Asset,
        ) => Promise<void | Readonly<Record<string, string | number | boolean | null>>>,
    ): Promise<AssetDetail> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.write"],
            async (transaction) => {
                const current = await getAsset(transaction, organizationId, assetId);
                const updated = await advanceAssetVersion(
                    transaction,
                    organizationId,
                    assetId,
                    expectedVersion,
                );
                const payload = await operation(transaction, current);
                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action,
                    resourceType: "asset",
                    resourceId: assetId,
                });
                const event: Record<typeof action, AssetHistoryEventType> = {
                    "asset.updated": "asset_updated",
                    "asset.lifecycle_changed": "lifecycle_changed",
                    "asset.identifier_added": "identifier_added",
                    "asset.identifier_changed": "identifier_changed",
                    "asset.identifier_retired": "identifier_retired",
                };
                await recordAssetHistory(transaction, {
                    organizationId,
                    assetId,
                    actorUserId: principal.user.id,
                    aggregateVersion: updated.version,
                    event: event[action],
                    payload: payload ?? {},
                });
                return this.getInTransaction(transaction, organizationId, assetId);
            },
        );
    }
}
