import { z } from "zod";

import { identifierSchema, instantSchema } from "../../shared/primitives";
import { assetRelationshipSubjectSchema } from "../../assets/history";

const id = identifierSchema;
const version = z.number().int().positive();
const text = z.string().trim().min(1).max(10_000);
const target = z.strictObject({
    subject: assetRelationshipSubjectSchema,
    partyId: id.optional(),
    siteId: id.optional(),
    partyAddressId: id.optional(),
    locationDescription: z.string().trim().min(1).max(500).optional(),
});

export const receiptCoordinationSchema = z.strictObject({
    custody: target.optional(),
    location: target.optional(),
});
export const receiptCoordinationStateSchema = receiptCoordinationSchema.extend({
    custodyRelationshipId: id.nullable().default(null),
    locationRelationshipId: id.nullable().default(null),
});

export const createReceiptSchema = z
    .strictObject({
        workOrderId: id,
        expectedOrderVersion: version,
        itemIds: z.array(id).min(1).max(100),
        assetId: id.nullable(),
        intakeDescription: text,
        observedCondition: text,
        accessories: z.array(text).max(100),
        receivedAt: instantSchema,
        responsibleActorName: z.string().trim().min(1).max(200),
        responsiblePartyId: id.nullable(),
        coordination: receiptCoordinationSchema,
        expectedAssetVersion: version.optional(),
        idempotencyKey: id,
    })
    .superRefine((value, context) => {
        if (
            value.assetId &&
            (value.coordination.custody || value.coordination.location) &&
            !value.expectedAssetVersion
        )
            context.addIssue({
                code: "custom",
                message: "Asset version required for coordination",
            });
        if (new Set(value.itemIds).size !== value.itemIds.length)
            context.addIssue({ code: "custom", message: "Duplicate work item" });
    });

export const correctReceiptSchema = z.strictObject({
    expectedVersion: version,
    expectedOrderVersion: version,
    idempotencyKey: id,
    reason: text,
    assetId: id.optional(),
    intakeDescription: text.optional(),
    observedCondition: text.optional(),
    accessories: z.array(text).max(100).optional(),
    receivedAt: instantSchema.optional(),
    responsibleActorName: z.string().trim().min(1).max(200).optional(),
    responsiblePartyId: id.nullable().optional(),
    coordination: receiptCoordinationSchema.optional(),
    expectedAssetVersion: version.optional(),
    void: z.boolean().optional(),
});

export const receiptSchema = z.strictObject({
    id,
    workOrderId: id,
    assetId: id.nullable(),
    intakeDescription: text,
    observedCondition: text,
    accessories: z.array(text),
    receivedAt: instantSchema,
    responsibleActorName: z.string(),
    responsiblePartyId: id.nullable(),
    coordination: receiptCoordinationStateSchema,
    custodyStatus: z.enum(["not_required", "pending", "applied"]),
    version,
    recordedAt: instantSchema,
    updatedAt: instantSchema,
    voidedAt: instantSchema.nullable(),
    itemIds: z.array(id),
});

export const receiptCorrectionSchema = z.strictObject({
    id,
    version,
    kind: z.enum(["corrected", "reconciled", "voided"]),
    reason: text,
    beforeSnapshot: z.record(z.string(), z.unknown()),
    afterSnapshot: z.record(z.string(), z.unknown()),
    correctedByUserId: id,
    correctedAt: instantSchema,
});

export const receiptDetailSchema = receiptSchema.extend({
    corrections: z.array(receiptCorrectionSchema),
});
export const receiptListResponseSchema = z.strictObject({ data: z.array(receiptSchema) });

export type ReceiptCoordination = z.infer<typeof receiptCoordinationSchema>;
export type ReceiptCoordinationState = z.infer<typeof receiptCoordinationStateSchema>;
export type CreateReceipt = z.infer<typeof createReceiptSchema>;
export type CorrectReceipt = z.infer<typeof correctReceiptSchema>;
export type ReceiptDetail = z.infer<typeof receiptDetailSchema>;
