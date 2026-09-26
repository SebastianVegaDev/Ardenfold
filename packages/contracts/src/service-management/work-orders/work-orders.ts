import { z } from "zod";

import { identifierSchema, instantSchema } from "../../shared/primitives";

const id = identifierSchema;
const version = z.number().int().positive();
const note = z.string().trim().min(1).max(10_000);
const quantity = z
    .string()
    .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/)
    .refine((value) => !/^0(?:\.0+)?$/.test(value));

export const workOrderStatusSchema = z.enum(["planned", "ready", "cancelled"]);
export const workItemStatusSchema = z.enum(["planned", "ready", "cancelled"]);
export const workItemAssetRequirementSchema = z.enum(["required", "not_applicable"]);
export const workItemServiceModeSchema = z.enum(["physical_intake", "no_intake"]);

export const workItemAllocationSchema = z
    .strictObject({
        sourceRevisionLineId: id,
        scopeDescription: note,
        allocatedQuantity: quantity,
        allocatedUnit: z.string().trim().min(1).max(40),
        partyId: id.nullable(),
        assetRequirement: workItemAssetRequirementSchema,
        assetId: id.nullable(),
        unresolvedAssetDescription: note.nullable(),
        serviceMode: workItemServiceModeSchema,
    })
    .superRefine((item, context) => {
        if (
            item.assetRequirement === "not_applicable" &&
            (item.assetId || item.unresolvedAssetDescription || item.serviceMode !== "no_intake")
        ) {
            context.addIssue({ code: "custom", message: "Asset-free work cannot require intake" });
        }
        if (
            item.assetRequirement === "required" &&
            !item.assetId &&
            !item.unresolvedAssetDescription
        ) {
            context.addIssue({
                code: "custom",
                message: "Required asset needs an identity or description",
            });
        }
    });

export const createWorkOrderSchema = z.strictObject({
    quoteId: id,
    acceptanceId: id,
    acceptedRevisionId: id,
    expectedQuoteVersion: version,
    expectedRequestVersion: version,
    siteId: id,
    reference: z.string().trim().min(1).max(80),
    idempotencyKey: id,
    items: z.array(workItemAllocationSchema).min(1).max(200),
});

export const updateWorkOrderSchema = z.strictObject({
    expectedVersion: version,
    reason: note,
    siteId: id.optional(),
    preparationNotes: note.nullable().optional(),
});
export const workOrderTransitionSchema = z.strictObject({
    expectedVersion: version,
    reason: note,
});
export const updateWorkItemSchema = z.strictObject({
    expectedOrderVersion: version,
    expectedItemVersion: version,
    reason: note,
    scopeDescription: note.optional(),
    partyId: id.nullable().optional(),
    assetId: id.nullable().optional(),
    unresolvedAssetDescription: note.nullable().optional(),
    serviceMode: workItemServiceModeSchema.optional(),
    preparationNotes: note.nullable().optional(),
});
export const workItemTransitionSchema = z.strictObject({
    expectedOrderVersion: version,
    expectedItemVersion: version,
    reason: note,
});
export const restructureWorkItemSchema = z.strictObject({
    expectedOrderVersion: version,
    expectedItemVersion: version,
    reason: note,
    replacements: z.array(workItemAllocationSchema).min(1).max(20),
});

export const workItemSchema = workItemAllocationSchema.safeExtend({
    id,
    workOrderId: id,
    itemNumber: version,
    replacesItemId: id.nullable(),
    status: workItemStatusSchema,
    version,
    preparationNotes: note.nullable(),
    cancelledAt: instantSchema.nullable(),
    cancellationReason: note.nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
});
export const workOrderHistoryEntrySchema = z.strictObject({
    id,
    version,
    kind: z.string(),
    snapshot: z.record(z.string(), z.unknown()),
    reason: note.nullable(),
    recordedAt: instantSchema,
    recordedByUserId: id,
});
export const workItemHistoryEntrySchema = workOrderHistoryEntrySchema.extend({ workItemId: id });
export const workOrderSummarySchema = z.strictObject({
    id,
    requestId: id,
    quoteId: id,
    acceptanceId: id,
    acceptedRevisionId: id,
    customerPartyId: id,
    siteId: id,
    reference: z.string(),
    status: workOrderStatusSchema,
    version,
    createdAt: instantSchema,
    updatedAt: instantSchema,
});
export const workOrderDetailSchema = workOrderSummarySchema.extend({
    initialAllocationSnapshot: z.record(z.string(), z.unknown()),
    preparationNotes: note.nullable(),
    cancelledAt: instantSchema.nullable(),
    cancellationReason: note.nullable(),
    items: z.array(workItemSchema),
    history: z.array(workOrderHistoryEntrySchema),
    itemHistory: z.array(workItemHistoryEntrySchema),
});
export const workOrderListQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    status: workOrderStatusSchema.optional(),
    requestId: id.optional(),
    siteId: id.optional(),
});
export const workOrderListResponseSchema = z.strictObject({
    data: z.array(workOrderSummarySchema),
    nextCursor: z.string().nullable(),
});
export const workItemReadinessBlockerSchema = z.enum([
    "WORK_ITEM_CANCELLED",
    "WORK_SITE_INACTIVE",
    "WORK_ITEM_PARTY_UNAVAILABLE",
    "WORK_ITEM_ASSET_UNRESOLVED",
    "WORK_ITEM_ASSET_UNAVAILABLE",
    "WORK_ITEM_INTAKE_REQUIRED",
    "WORK_ITEM_INTAKE_CUSTODY_PENDING",
    "WORK_ITEM_INTAKE_CUSTODY_STALE",
]);
export const workOrderReadinessResponseSchema = z.strictObject({
    data: z.array(
        z.strictObject({ itemId: id, blocker: workItemReadinessBlockerSchema.nullable() }),
    ),
});

export type WorkItemAllocation = z.infer<typeof workItemAllocationSchema>;
export type CreateWorkOrder = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrder = z.infer<typeof updateWorkOrderSchema>;
export type WorkOrderTransition = z.infer<typeof workOrderTransitionSchema>;
export type UpdateWorkItem = z.infer<typeof updateWorkItemSchema>;
export type WorkItemTransition = z.infer<typeof workItemTransitionSchema>;
export type RestructureWorkItem = z.infer<typeof restructureWorkItemSchema>;
export type WorkOrderDetail = z.infer<typeof workOrderDetailSchema>;
export type WorkOrderListQuery = z.infer<typeof workOrderListQuerySchema>;
export type WorkOrderListResponse = z.infer<typeof workOrderListResponseSchema>;
export type WorkOrderReadinessResponse = z.infer<typeof workOrderReadinessResponseSchema>;
export type WorkItemReadinessBlocker = z.infer<typeof workItemReadinessBlockerSchema>;
