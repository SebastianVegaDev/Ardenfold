import { z } from "zod";

import { identifierSchema, instantSchema } from "../../shared/primitives";

const id = identifierSchema;
const version = z.number().int().positive();
const reason = z.string().trim().min(1).max(4000);
const boundedText = z.string().trim().min(1).max(4000);

export const startTechnicalExecutionSchema = z.strictObject({
    workOrderId: id,
    workItemId: id,
    expectedOrderVersion: version,
    expectedItemVersion: version,
    idempotencyKey: id,
});
export type StartTechnicalExecution = z.infer<typeof startTechnicalExecutionSchema>;

export const technicalConditionInputSchema = z
    .strictObject({
        position: version,
        name: z.string().trim().min(1).max(160),
        decimalValue: z
            .string()
            .regex(/^-?[0-9]{1,16}(?:\.[0-9]{1,12})?$/)
            .optional(),
        unitCode: z.string().trim().min(1).max(40).optional(),
        textValue: boundedText.optional(),
        observedAt: instantSchema.optional(),
    })
    .refine(
        (value) =>
            (value.decimalValue !== undefined &&
                value.unitCode !== undefined &&
                value.textValue === undefined) ||
            (value.decimalValue === undefined &&
                value.unitCode === undefined &&
                value.textValue !== undefined),
    );

export const supportingAssetInputSchema = z.strictObject({
    assetId: id,
    position: version,
    use: z.string().trim().min(1).max(160),
});

export const editExecutionDraftSchema = z.strictObject({
    expectedVersion: version,
    performerUserId: id.nullable().optional(),
    methodName: z.string().trim().min(1).max(240).nullable().optional(),
    methodIdentifier: z.string().trim().min(1).max(120).nullable().optional(),
    methodVersion: z.string().trim().min(1).max(120).nullable().optional(),
    performedStartedAt: instantSchema.nullable().optional(),
    performedEndedAt: instantSchema.nullable().optional(),
    performedAtSiteId: id.nullable().optional(),
    performedLocationSnapshot: z.string().trim().min(1).max(240).nullable().optional(),
    technicianNotes: boundedText.nullable().optional(),
    conditions: z.array(technicalConditionInputSchema).max(100).optional(),
    supportingAssets: z.array(supportingAssetInputSchema).max(100).optional(),
});
export type EditExecutionDraft = z.infer<typeof editExecutionDraftSchema>;

export const submitExecutionRevisionSchema = z.strictObject({
    expectedVersion: version,
    idempotencyKey: id,
});
export type SubmitExecutionRevision = z.infer<typeof submitExecutionRevisionSchema>;

export const createSuccessorRevisionSchema = z.strictObject({
    expectedExecutionVersion: version,
    predecessorRevisionId: id,
    reason,
    idempotencyKey: id,
});
export type CreateSuccessorRevision = z.infer<typeof createSuccessorRevisionSchema>;

export const discardExecutionDraftSchema = z.strictObject({ expectedVersion: version, reason });
export type DiscardExecutionDraft = z.infer<typeof discardExecutionDraftSchema>;

export const abandonTechnicalExecutionSchema = z.strictObject({ expectedVersion: version, reason });
export type AbandonTechnicalExecution = z.infer<typeof abandonTechnicalExecutionSchema>;

export const technicalExecutionListQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    workItemId: id.optional(),
    status: z.enum(["active", "abandoned"]).optional(),
});
export type TechnicalExecutionListQuery = z.infer<typeof technicalExecutionListQuerySchema>;
