import {
    assetCurrentRelationshipsSchema,
    assetHistoryResponseSchema,
    assetRelationshipHistoryResponseSchema,
    assetRelationshipSchema,
    type AssetCurrentRelationships,
    type AssetHistoryQuery,
    type AssetHistoryResponse,
    type AssetRelationshipHistoryResponse,
    type CorrectAssetRelationshipRequest,
    type EndAssetRelationshipRequest,
    type StartAssetRelationshipRequest,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    assetHistoryEntries,
    assetRelationships,
    organizationSites,
    parties,
    partyAddresses,
    type AssetRelationship,
    type NewAssetRelationship,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { recordAuditEvent } from "../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";
import { recordAssetHistory } from "../history/asset-history.writer";
import { advanceAssetVersion, getAsset } from "../shared/asset-transaction";

type Target = Pick<
    NewAssetRelationship,
    "subject" | "partyId" | "siteId" | "partyAddressId" | "locationDescription"
>;
type TargetInput = Pick<
    StartAssetRelationshipRequest,
    "subject" | "partyId" | "siteId" | "partyAddressId" | "locationDescription"
>;

const historyCursorSchema = z.strictObject({ at: z.iso.datetime({ precision: 3 }), id: z.uuid() });

function decodeCursor(value: string): z.infer<typeof historyCursorSchema> {
    try {
        return historyCursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString()));
    } catch {
        throw new ContractException("INVALID_ASSET_HISTORY_CURSOR", 400);
    }
}

function encodeCursor(date: Date, id: string): string {
    return Buffer.from(JSON.stringify({ at: date.toISOString(), id }), "utf8").toString(
        "base64url",
    );
}

function effectiveDate(value: string): Date {
    const date = new Date(value);
    if (date.getTime() > Date.now()) throw new ContractException("FUTURE_RELATIONSHIP_DATE", 400);
    return date;
}

function relationshipResponse(row: AssetRelationship) {
    return assetRelationshipSchema.parse({
        id: row.id,
        kind: row.kind,
        subject: row.subject,
        partyId: row.partyId,
        siteId: row.siteId,
        partyAddressId: row.partyAddressId,
        locationDescription: row.locationDescription,
        effectiveFrom: row.effectiveFrom.toISOString(),
        effectiveTo: row.effectiveTo?.toISOString() ?? null,
        supersedesId: row.supersedesId,
        supersededAt: row.supersededAt?.toISOString() ?? null,
        revisionReason: row.revisionReason,
        aggregateVersion: row.aggregateVersion,
        recordedByUserId: row.recordedByUserId,
        recordedAt: row.recordedAt.toISOString(),
    });
}

@Injectable()
export class AssetRelationshipsService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    current(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
    ): Promise<AssetCurrentRelationships> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.read"],
            (transaction) => this.currentInTransaction(transaction, organizationId, assetId),
        );
    }

    async currentInTransaction(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        assetId: string,
    ): Promise<AssetCurrentRelationships> {
        const asset = await getAsset(transaction, organizationId, assetId);
        const rows = await transaction
            .select()
            .from(assetRelationships)
            .where(
                and(
                    eq(assetRelationships.organizationId, organizationId),
                    eq(assetRelationships.assetId, assetId),
                    isNull(assetRelationships.effectiveTo),
                    isNull(assetRelationships.supersededAt),
                ),
            );
        const current = (kind: AssetRelationship["kind"]) => {
            const row = rows.find((item) => item.kind === kind);
            return row ? relationshipResponse(row) : null;
        };
        return assetCurrentRelationshipsSchema.parse({
            assetId,
            assetVersion: asset.version,
            ownership: current("ownership"),
            custody: current("custody"),
            location: current("location"),
        });
    }

    async relationshipHistory(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        query: AssetHistoryQuery,
    ): Promise<AssetRelationshipHistoryResponse> {
        const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.read"],
            async (transaction) => {
                await getAsset(transaction, organizationId, assetId);
                const rows = await transaction
                    .select()
                    .from(assetRelationships)
                    .where(
                        and(
                            eq(assetRelationships.organizationId, organizationId),
                            eq(assetRelationships.assetId, assetId),
                            cursor
                                ? or(
                                      lt(assetRelationships.recordedAt, new Date(cursor.at)),
                                      and(
                                          eq(assetRelationships.recordedAt, new Date(cursor.at)),
                                          lt(assetRelationships.id, cursor.id),
                                      ),
                                  )
                                : undefined,
                        ),
                    )
                    .orderBy(desc(assetRelationships.recordedAt), desc(assetRelationships.id))
                    .limit(query.limit + 1);
                const page = rows.slice(0, query.limit);
                const last = page.at(-1);
                return assetRelationshipHistoryResponseSchema.parse({
                    data: page.map(relationshipResponse),
                    nextCursor:
                        rows.length > query.limit && last
                            ? encodeCursor(last.recordedAt, last.id)
                            : null,
                });
            },
        );
    }

    async businessHistory(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        query: AssetHistoryQuery,
    ): Promise<AssetHistoryResponse> {
        const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.read"],
            async (transaction) => {
                await getAsset(transaction, organizationId, assetId);
                const rows = await transaction
                    .select()
                    .from(assetHistoryEntries)
                    .where(
                        and(
                            eq(assetHistoryEntries.organizationId, organizationId),
                            eq(assetHistoryEntries.assetId, assetId),
                            cursor
                                ? or(
                                      lt(assetHistoryEntries.occurredAt, new Date(cursor.at)),
                                      and(
                                          eq(assetHistoryEntries.occurredAt, new Date(cursor.at)),
                                          lt(assetHistoryEntries.id, cursor.id),
                                      ),
                                  )
                                : undefined,
                        ),
                    )
                    .orderBy(desc(assetHistoryEntries.occurredAt), desc(assetHistoryEntries.id))
                    .limit(query.limit + 1);
                const page = rows.slice(0, query.limit);
                const last = page.at(-1);
                return assetHistoryResponseSchema.parse({
                    data: page.map((row) => ({
                        id: row.id,
                        event: row.event,
                        aggregateVersion: row.aggregateVersion,
                        actorUserId: row.actorUserId,
                        traceId: row.traceId,
                        source: row.source,
                        sourceReferenceId: row.sourceReferenceId,
                        payload: row.payload,
                        occurredAt: row.occurredAt.toISOString(),
                    })),
                    nextCursor:
                        rows.length > query.limit && last
                            ? encodeCursor(last.occurredAt, last.id)
                            : null,
                });
            },
        );
    }

    start(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        input: StartAssetRelationshipRequest,
    ): Promise<AssetCurrentRelationships> {
        return this.change(
            principal,
            organizationId,
            assetId,
            input.expectedVersion,
            "started",
            async (transaction, version) => {
                const at = effectiveDate(input.effectiveAt);
                const target = await this.validateTarget(
                    transaction,
                    organizationId,
                    input.kind,
                    input,
                );
                const current = await this.findCurrent(
                    transaction,
                    organizationId,
                    assetId,
                    input.kind,
                );
                if (current) {
                    if (at <= current.effectiveFrom)
                        throw new ContractException("RELATIONSHIP_INTERVAL_CONFLICT", 409);
                    await this.supersede(transaction, current);
                    await transaction.insert(assetRelationships).values({
                        ...this.revision(current, version, principal.user.id),
                        effectiveTo: at,
                        revisionReason: "transition",
                    });
                } else {
                    const latest = await this.findLatest(
                        transaction,
                        organizationId,
                        assetId,
                        input.kind,
                    );
                    if (latest?.effectiveTo && at < latest.effectiveTo)
                        throw new ContractException("RELATIONSHIP_INTERVAL_CONFLICT", 409);
                }
                const [started] = await transaction
                    .insert(assetRelationships)
                    .values({
                        organizationId,
                        assetId,
                        kind: input.kind,
                        ...target,
                        effectiveFrom: at,
                        aggregateVersion: version,
                        recordedByUserId: principal.user.id,
                    })
                    .returning({ id: assetRelationships.id });
                return {
                    kind: input.kind,
                    relationshipId: started!.id,
                    previousId: current?.id ?? null,
                };
            },
        );
    }

    end(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        input: EndAssetRelationshipRequest,
    ): Promise<AssetCurrentRelationships> {
        return this.change(
            principal,
            organizationId,
            assetId,
            input.expectedVersion,
            "ended",
            async (transaction, version) => {
                const at = effectiveDate(input.effectiveAt);
                const current = await this.findCurrent(
                    transaction,
                    organizationId,
                    assetId,
                    input.kind,
                );
                if (!current) throw new ContractException("RELATIONSHIP_NOT_CURRENT", 409);
                if (at <= current.effectiveFrom)
                    throw new ContractException("RELATIONSHIP_INTERVAL_CONFLICT", 409);
                await this.supersede(transaction, current);
                const [closed] = await transaction
                    .insert(assetRelationships)
                    .values({
                        ...this.revision(current, version, principal.user.id),
                        effectiveTo: at,
                        revisionReason: "ended",
                    })
                    .returning({ id: assetRelationships.id });
                return { kind: input.kind, relationshipId: closed!.id, previousId: current.id };
            },
        );
    }

    correct(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        input: CorrectAssetRelationshipRequest,
    ): Promise<AssetCurrentRelationships> {
        return this.change(
            principal,
            organizationId,
            assetId,
            input.expectedVersion,
            "corrected",
            async (transaction, version) => {
                const at = effectiveDate(input.effectiveAt);
                const target = await this.validateTarget(
                    transaction,
                    organizationId,
                    input.kind,
                    input,
                );
                const current = await this.findCurrent(
                    transaction,
                    organizationId,
                    assetId,
                    input.kind,
                );
                if (!current) throw new ContractException("RELATIONSHIP_NOT_CURRENT", 409);
                const latestClosed = await this.findLatestClosed(
                    transaction,
                    organizationId,
                    assetId,
                    input.kind,
                );
                if (latestClosed?.effectiveTo && at < latestClosed.effectiveTo)
                    throw new ContractException("RELATIONSHIP_INTERVAL_CONFLICT", 409);
                await this.supersede(transaction, current);
                const [corrected] = await transaction
                    .insert(assetRelationships)
                    .values({
                        organizationId,
                        assetId,
                        kind: input.kind,
                        ...target,
                        effectiveFrom: at,
                        supersedesId: current.id,
                        revisionReason: input.reason,
                        aggregateVersion: version,
                        recordedByUserId: principal.user.id,
                    })
                    .returning({ id: assetRelationships.id });
                return {
                    kind: input.kind,
                    relationshipId: corrected!.id,
                    previousId: current.id,
                    reason: input.reason,
                };
            },
        );
    }

    private async change(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        expectedVersion: number,
        change: "started" | "ended" | "corrected",
        operation: (
            transaction: ArdenfoldTransaction,
            version: number,
        ) => Promise<Record<string, string | number | boolean | null>>,
    ): Promise<AssetCurrentRelationships> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["assets.manage_relationships"],
            async (transaction) => {
                const updated = await advanceAssetVersion(
                    transaction,
                    organizationId,
                    assetId,
                    expectedVersion,
                );
                const payload = await operation(transaction, updated.version);
                await recordAssetHistory(transaction, {
                    organizationId,
                    assetId,
                    actorUserId: principal.user.id,
                    aggregateVersion: updated.version,
                    event: `relationship_${change}`,
                    payload,
                });
                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: `asset.relationship_${change}`,
                    resourceType: "asset",
                    resourceId: assetId,
                    metadata: { kind: String(payload.kind) },
                });
                return this.currentInTransaction(transaction, organizationId, assetId);
            },
        );
    }

    private async validateTarget(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        kind: StartAssetRelationshipRequest["kind"],
        input: TargetInput,
    ): Promise<Target> {
        const partyId = input.partyId ?? null;
        const siteId = input.siteId ?? null;
        const partyAddressId = input.partyAddressId ?? null;
        const locationDescription = input.locationDescription ?? null;
        const validShape =
            kind === "location"
                ? partyId === null &&
                  locationDescription !== null &&
                  ((input.subject === "site" && siteId !== null && partyAddressId === null) ||
                      (input.subject === "party_address" &&
                          partyAddressId !== null &&
                          siteId === null) ||
                      (input.subject === "freeform" && siteId === null && partyAddressId === null))
                : siteId === null &&
                  partyAddressId === null &&
                  locationDescription === null &&
                  ((input.subject === "party" && partyId !== null) ||
                      (input.subject === "recording_organization" && partyId === null));
        if (!validShape) throw new ContractException("INVALID_RELATIONSHIP_TARGET", 400);

        if (partyId) {
            const [party] = await transaction
                .select({ id: parties.id })
                .from(parties)
                .where(
                    and(
                        eq(parties.organizationId, organizationId),
                        eq(parties.id, partyId),
                        eq(parties.status, "active"),
                    ),
                );
            if (!party) throw new ContractException("RELATIONSHIP_TARGET_NOT_FOUND", 404);
        }
        if (siteId) {
            const [site] = await transaction
                .select({ id: organizationSites.id })
                .from(organizationSites)
                .where(
                    and(
                        eq(organizationSites.organizationId, organizationId),
                        eq(organizationSites.id, siteId),
                        eq(organizationSites.isActive, true),
                    ),
                );
            if (!site) throw new ContractException("RELATIONSHIP_TARGET_NOT_FOUND", 404);
        }
        if (partyAddressId) {
            const [address] = await transaction
                .select({ id: partyAddresses.id })
                .from(partyAddresses)
                .innerJoin(
                    parties,
                    and(
                        eq(parties.organizationId, partyAddresses.organizationId),
                        eq(parties.id, partyAddresses.partyId),
                    ),
                )
                .where(
                    and(
                        eq(partyAddresses.organizationId, organizationId),
                        eq(partyAddresses.id, partyAddressId),
                        eq(parties.status, "active"),
                    ),
                );
            if (!address) throw new ContractException("RELATIONSHIP_TARGET_NOT_FOUND", 404);
        }
        return { subject: input.subject, partyId, siteId, partyAddressId, locationDescription };
    }

    private findCurrent(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        assetId: string,
        kind: AssetRelationship["kind"],
    ): Promise<AssetRelationship | undefined> {
        return transaction
            .select()
            .from(assetRelationships)
            .where(
                and(
                    eq(assetRelationships.organizationId, organizationId),
                    eq(assetRelationships.assetId, assetId),
                    eq(assetRelationships.kind, kind),
                    isNull(assetRelationships.effectiveTo),
                    isNull(assetRelationships.supersededAt),
                ),
            )
            .then((rows) => rows[0]);
    }

    private findLatestClosed(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        assetId: string,
        kind: AssetRelationship["kind"],
    ): Promise<AssetRelationship | undefined> {
        return transaction
            .select()
            .from(assetRelationships)
            .where(
                and(
                    eq(assetRelationships.organizationId, organizationId),
                    eq(assetRelationships.assetId, assetId),
                    eq(assetRelationships.kind, kind),
                    isNull(assetRelationships.supersededAt),
                    sql`${assetRelationships.effectiveTo} IS NOT NULL`,
                ),
            )
            .orderBy(desc(assetRelationships.effectiveTo))
            .limit(1)
            .then((rows) => rows[0]);
    }

    private findLatest(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        assetId: string,
        kind: AssetRelationship["kind"],
    ): Promise<AssetRelationship | undefined> {
        return this.findLatestClosed(transaction, organizationId, assetId, kind);
    }

    private async supersede(
        transaction: ArdenfoldTransaction,
        current: AssetRelationship,
    ): Promise<void> {
        await transaction
            .update(assetRelationships)
            .set({ supersededAt: new Date() })
            .where(
                and(
                    eq(assetRelationships.organizationId, current.organizationId),
                    eq(assetRelationships.id, current.id),
                    isNull(assetRelationships.supersededAt),
                ),
            );
    }

    private revision(
        current: AssetRelationship,
        aggregateVersion: number,
        recordedByUserId: string,
    ): NewAssetRelationship {
        return {
            organizationId: current.organizationId,
            assetId: current.assetId,
            kind: current.kind,
            subject: current.subject,
            partyId: current.partyId,
            siteId: current.siteId,
            partyAddressId: current.partyAddressId,
            locationDescription: current.locationDescription,
            effectiveFrom: current.effectiveFrom,
            supersedesId: current.id,
            aggregateVersion,
            recordedByUserId,
        };
    }
}
