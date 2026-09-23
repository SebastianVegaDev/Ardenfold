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
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { recordAuditEvent } from "../audit/audit.service";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { OrganizationAuthorizationService } from "../auth/organization-authorization.service";
import { ContractException } from "../http/contracts";
import { advanceAssetVersion, getAsset } from "./asset-transaction";

const cursorSchema = z.strictObject({ name: z.string(), id: z.uuid() });

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
        let cursor: z.infer<typeof cursorSchema> | undefined;
        if (query.cursor) {
            try {
                cursor = cursorSchema.parse(
                    JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
                );
            } catch {
                throw new ContractException("INVALID_ASSET_CURSOR", 400);
            }
        }
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.read"],
            async (transaction) => {
                const normalizedName = sql`lower(${assets.displayName})`;
                const conditions = [eq(assets.organizationId, organizationId)];
                if (query.status) conditions.push(eq(assets.status, query.status));
                if (query.lifecycle) conditions.push(eq(assets.lifecycle, query.lifecycle));
                if (query.name) {
                    const escaped = query.name.toLowerCase().replace(/[\\%_]/gu, "\\$&");
                    conditions.push(sql`${normalizedName} LIKE ${`%${escaped}%`} ESCAPE ${"\\"}`);
                }
                if (cursor)
                    conditions.push(
                        sql`(${normalizedName}, ${assets.id}) > (${cursor.name}, ${cursor.id}::uuid)`,
                    );
                const rows = await transaction
                    .select()
                    .from(assets)
                    .where(and(...conditions))
                    .orderBy(asc(normalizedName), asc(assets.id))
                    .limit(query.limit + 1);
                const page = rows.slice(0, query.limit);
                const last = page.at(-1);
                return assetListResponseSchema.parse({
                    data: page.map(summary),
                    nextCursor:
                        rows.length > query.limit && last
                            ? Buffer.from(
                                  JSON.stringify({
                                      name: last.displayName.toLowerCase(),
                                      id: last.id,
                                  }),
                                  "utf8",
                              ).toString("base64url")
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
                await transaction.insert(assetIdentifiers).values({
                    organizationId,
                    assetId,
                    type: input.type.toLowerCase(),
                    originalValue: input.originalValue,
                    normalizedValue,
                });
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
                await transaction.insert(assetIdentifiers).values({
                    organizationId,
                    assetId,
                    type: input.type.toLowerCase(),
                    originalValue: input.originalValue,
                    normalizedValue,
                });
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
        operation: (transaction: ArdenfoldTransaction, current: Asset) => Promise<void>,
    ): Promise<AssetDetail> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.write"],
            async (transaction) => {
                const current = await getAsset(transaction, organizationId, assetId);
                await advanceAssetVersion(transaction, organizationId, assetId, expectedVersion);
                await operation(transaction, current);
                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action,
                    resourceType: "asset",
                    resourceId: assetId,
                });
                return this.getInTransaction(transaction, organizationId, assetId);
            },
        );
    }
}
