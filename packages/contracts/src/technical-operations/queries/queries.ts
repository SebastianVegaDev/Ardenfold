import { z } from "zod";

import { identifierSchema, instantSchema } from "../../shared/primitives";

export const technicalQueueKindSchema = z.enum([
    "ready_to_execute",
    "in_progress",
    "awaiting_review",
    "changes_requested",
    "awaiting_approval",
    "approved",
]);
export const technicalQueueQuerySchema = z.strictObject({
    kind: technicalQueueKindSchema,
    limit: z.coerce.number().int().min(1).max(50).default(25),
    cursor: z.string().min(1).max(2048).optional(),
    customerPartyId: identifierSchema.optional(),
    siteId: identifierSchema.optional(),
    assetId: identifierSchema.optional(),
});
export type TechnicalQueueQuery = z.infer<typeof technicalQueueQuerySchema>;

export const technicalQueueEntrySchema = z.strictObject({
    subjectId: identifierSchema,
    executionId: identifierSchema.nullable(),
    revisionId: identifierSchema.nullable(),
    workOrderId: identifierSchema,
    workItemId: identifierSchema,
    status: z.string(),
    occurredAt: instantSchema,
    customer: z.strictObject({
        id: identifierSchema,
        currentName: z.string(),
        currentStatus: z.enum(["active", "archived"]),
    }),
    siteId: identifierSchema,
    asset: z
        .strictObject({
            id: identifierSchema,
            currentName: z.string(),
            currentStatus: z.enum(["active", "archived"]),
        })
        .nullable(),
});
export const technicalQueueResponseSchema = z.strictObject({
    data: z.array(technicalQueueEntrySchema),
    nextCursor: z.string().nullable(),
});
export type TechnicalQueueResponse = z.infer<typeof technicalQueueResponseSchema>;

export const technicalHistoryQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    afterVersion: z.coerce.number().int().min(0).default(0),
});
export type TechnicalHistoryQuery = z.infer<typeof technicalHistoryQuerySchema>;

export const technicalRevisionSearchQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(50).default(25),
    cursor: z.string().min(1).max(2048).optional(),
    sort: z.enum(["newest", "oldest"]).default("newest"),
    status: z.enum(["draft", "submitted", "discarded"]).optional(),
    workOrderId: identifierSchema.optional(),
    workItemId: identifierSchema.optional(),
    customerPartyId: identifierSchema.optional(),
    assetId: identifierSchema.optional(),
    siteId: identifierSchema.optional(),
    performerUserId: identifierSchema.optional(),
    reviewerUserId: identifierSchema.optional(),
    approverUserId: identifierSchema.optional(),
    createdFrom: instantSchema.optional(),
    createdTo: instantSchema.optional(),
    submittedFrom: instantSchema.optional(),
    submittedTo: instantSchema.optional(),
    reviewedFrom: instantSchema.optional(),
    reviewedTo: instantSchema.optional(),
    approvedFrom: instantSchema.optional(),
    approvedTo: instantSchema.optional(),
});
export type TechnicalRevisionSearchQuery = z.infer<typeof technicalRevisionSearchQuerySchema>;
