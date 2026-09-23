import { z } from "zod";

const id = z.uuid();
const instant = z.iso.datetime({ precision: 3 });
const version = z.number().int().positive();

export const assetRelationshipKindSchema = z.enum(["ownership", "custody", "location"]);
export const assetRelationshipSubjectSchema = z.enum([
    "party",
    "recording_organization",
    "site",
    "party_address",
    "freeform",
]);

export const assetRelationshipSchema = z.strictObject({
    id,
    kind: assetRelationshipKindSchema,
    subject: assetRelationshipSubjectSchema,
    partyId: id.nullable(),
    siteId: id.nullable(),
    partyAddressId: id.nullable(),
    locationDescription: z.string().min(1).max(500).nullable(),
    effectiveFrom: instant,
    effectiveTo: instant.nullable(),
    supersedesId: id.nullable(),
    supersededAt: instant.nullable(),
    revisionReason: z.string().min(1).max(500).nullable(),
    aggregateVersion: version,
    recordedByUserId: id,
    recordedAt: instant,
});

export const assetCurrentRelationshipsSchema = z.strictObject({
    assetId: id,
    assetVersion: version,
    ownership: assetRelationshipSchema.nullable(),
    custody: assetRelationshipSchema.nullable(),
    location: assetRelationshipSchema.nullable(),
});

export const assetRelationshipHistoryResponseSchema = z.strictObject({
    data: z.array(assetRelationshipSchema),
    nextCursor: z.string().nullable(),
});

export const assetHistoryEventSchema = z.enum([
    "asset_created",
    "asset_updated",
    "lifecycle_changed",
    "identifier_added",
    "identifier_changed",
    "identifier_retired",
    "asset_archived",
    "asset_restored",
    "relationship_started",
    "relationship_ended",
    "relationship_corrected",
]);

export const assetHistoryEntrySchema = z.strictObject({
    id,
    event: assetHistoryEventSchema,
    aggregateVersion: version,
    actorUserId: id,
    traceId: id,
    source: z.string().min(1).max(64),
    sourceReferenceId: id.nullable(),
    payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    occurredAt: instant,
});

export const assetHistoryResponseSchema = z.strictObject({
    data: z.array(assetHistoryEntrySchema),
    nextCursor: z.string().nullable(),
});

export const assetHistoryQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(512).optional(),
});

const relationshipTarget = z.strictObject({
    subject: assetRelationshipSubjectSchema,
    partyId: id.optional(),
    siteId: id.optional(),
    partyAddressId: id.optional(),
    locationDescription: z.string().trim().min(1).max(500).optional(),
});

export const startAssetRelationshipRequestSchema = relationshipTarget.extend({
    expectedVersion: version,
    kind: assetRelationshipKindSchema,
    effectiveAt: instant,
});

export const endAssetRelationshipRequestSchema = z.strictObject({
    expectedVersion: version,
    kind: assetRelationshipKindSchema,
    effectiveAt: instant,
});

export const correctAssetRelationshipRequestSchema = relationshipTarget.extend({
    expectedVersion: version,
    kind: assetRelationshipKindSchema,
    effectiveAt: instant,
    reason: z.string().trim().min(1).max(500),
});

export type AssetRelationship = z.infer<typeof assetRelationshipSchema>;
export type AssetCurrentRelationships = z.infer<typeof assetCurrentRelationshipsSchema>;
export type AssetRelationshipHistoryResponse = z.infer<
    typeof assetRelationshipHistoryResponseSchema
>;
export type AssetHistoryEntry = z.infer<typeof assetHistoryEntrySchema>;
export type AssetHistoryResponse = z.infer<typeof assetHistoryResponseSchema>;
export type AssetHistoryQuery = z.infer<typeof assetHistoryQuerySchema>;
export type StartAssetRelationshipRequest = z.infer<typeof startAssetRelationshipRequestSchema>;
export type EndAssetRelationshipRequest = z.infer<typeof endAssetRelationshipRequestSchema>;
export type CorrectAssetRelationshipRequest = z.infer<typeof correctAssetRelationshipRequestSchema>;
