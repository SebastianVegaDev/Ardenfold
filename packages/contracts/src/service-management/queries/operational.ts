import { z } from "zod";

import { identifierSchema, instantSchema } from "../../shared/primitives";

const id = identifierSchema;
export const operationalQueueKindSchema = z.enum([
    "commercial_follow_up",
    "awaiting_customer",
    "accepted_unoperationalized",
    "active_work",
    "items_not_ready",
    "intake_needed",
]);
export const operationalQueueQuerySchema = z.strictObject({
    kind: operationalQueueKindSchema,
    limit: z.coerce.number().int().min(1).max(50).default(25),
    cursor: z.string().min(1).max(1024).optional(),
    customerPartyId: id.optional(),
    siteId: id.optional(),
});
export const operationalQueueEntrySchema = z.strictObject({
    subjectId: id,
    subjectType: z.enum(["request", "quote", "acceptance", "work_order", "work_item"]),
    requestId: id,
    quoteId: id.nullable(),
    revisionId: id.nullable(),
    acceptanceId: id.nullable(),
    workOrderId: id.nullable(),
    workItemId: id.nullable(),
    reference: z.string(),
    title: z.string(),
    status: z.string(),
    occurredAt: instantSchema,
    customer: z.strictObject({
        id,
        currentName: z.string(),
        currentStatus: z.enum(["active", "archived"]),
    }),
    siteId: id.nullable(),
    asset: z
        .strictObject({
            id,
            currentName: z.string(),
            currentStatus: z.enum(["active", "archived"]),
        })
        .nullable(),
    receiptStatus: z.enum(["none", "pending", "applied", "not_required"]).nullable(),
});
export const operationalQueueResponseSchema = z.strictObject({
    data: z.array(operationalQueueEntrySchema),
    nextCursor: z.string().nullable(),
});
export const requestTimelineQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(1024).optional(),
});
export const requestTimelineEventSchema = z.strictObject({
    key: z.string(),
    source: z.enum(["request", "quote", "work_order", "work_item", "receipt", "asset_registry"]),
    kind: z.string(),
    occurredAt: instantSchema,
    actorUserId: id,
    requestId: id,
    quoteId: id.nullable(),
    revisionId: id.nullable(),
    acceptanceId: id.nullable(),
    workOrderId: id.nullable(),
    workItemId: id.nullable(),
    receiptId: id.nullable(),
    assetId: id.nullable(),
    reason: z.string().nullable(),
    historicalDetails: z.record(z.string(), z.unknown()).nullable(),
});
export const requestTimelineResponseSchema = z.strictObject({
    request: z.strictObject({ id, summary: z.string(), status: z.string() }),
    currentCustomer: z.strictObject({
        id,
        name: z.string(),
        status: z.enum(["active", "archived"]),
    }),
    currentAssets: z.array(
        z.strictObject({
            id,
            name: z.string(),
            status: z.enum(["active", "archived"]),
        }),
    ),
    data: z.array(requestTimelineEventSchema),
    nextCursor: z.string().nullable(),
});
export type OperationalQueueQuery = z.infer<typeof operationalQueueQuerySchema>;
export type OperationalQueueResponse = z.infer<typeof operationalQueueResponseSchema>;
export type RequestTimelineQuery = z.infer<typeof requestTimelineQuerySchema>;
export type RequestTimelineResponse = z.infer<typeof requestTimelineResponseSchema>;
