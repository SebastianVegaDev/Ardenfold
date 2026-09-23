import { z } from "zod";

const id = z.uuid();
const name = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().min(1).max(200).nullable();
const version = z.number().int().positive();
const instant = z.iso.datetime({ precision: 3 });

export const assetLifecycleSchema = z.enum([
    "registered",
    "in_service",
    "out_of_service",
    "retired",
]);
export const assetStatusSchema = z.enum(["active", "archived"]);
export const assetIdentifierStatusSchema = z.enum(["active", "retired"]);

export const assetIdentifierSchema = z.strictObject({
    id,
    type: z.string().min(1).max(64),
    originalValue: z.string().min(1).max(255),
    normalizedValue: z.string().min(1).max(255),
    status: assetIdentifierStatusSchema,
    retiredAt: instant.nullable(),
});

export const assetSummarySchema = z.strictObject({
    id,
    displayName: name,
    description: z.string().min(1).nullable(),
    manufacturer: optionalText,
    model: optionalText,
    classification: z.string().min(1).max(120).nullable(),
    lifecycle: assetLifecycleSchema,
    status: assetStatusSchema,
    version,
    createdAt: instant,
    updatedAt: instant,
    archivedAt: instant.nullable(),
});

export const assetDuplicateCandidateSchema = z.strictObject({
    id,
    displayName: name,
    matchedType: z.string().min(1).max(64),
});

export const assetDetailSchema = assetSummarySchema.extend({
    identifiers: z.array(assetIdentifierSchema),
    duplicateCandidates: z.array(assetDuplicateCandidateSchema),
});

export const assetListResponseSchema = z.strictObject({
    data: z.array(assetSummarySchema),
    nextCursor: z.string().nullable(),
});

export const assetListQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    status: assetStatusSchema.optional(),
    lifecycle: assetLifecycleSchema.optional(),
    name: z.string().trim().min(1).max(100).optional(),
});

export const newAssetIdentifierSchema = z.strictObject({
    type: z.string().trim().min(1).max(64),
    originalValue: z.string().trim().min(1).max(255),
});

export const createAssetRequestSchema = z.strictObject({
    displayName: name,
    description: z.string().trim().min(1).max(10_000).nullable().optional(),
    manufacturer: optionalText.optional(),
    model: optionalText.optional(),
    classification: z.string().trim().min(1).max(120).nullable().optional(),
    lifecycle: assetLifecycleSchema.default("registered"),
    identifiers: z.array(newAssetIdentifierSchema).max(20).default([]),
});

export const updateAssetRequestSchema = z
    .strictObject({
        expectedVersion: version,
        displayName: name.optional(),
        description: z.string().trim().min(1).max(10_000).nullable().optional(),
        manufacturer: optionalText.optional(),
        model: optionalText.optional(),
        classification: z.string().trim().min(1).max(120).nullable().optional(),
    })
    .refine(
        (input) =>
            input.displayName !== undefined ||
            input.description !== undefined ||
            input.manufacturer !== undefined ||
            input.model !== undefined ||
            input.classification !== undefined,
    );

export const assetVersionRequestSchema = z.strictObject({ expectedVersion: version });
export const setAssetLifecycleRequestSchema = assetVersionRequestSchema.extend({
    lifecycle: assetLifecycleSchema,
});
export const addAssetIdentifierRequestSchema = assetVersionRequestSchema.extend(
    newAssetIdentifierSchema.shape,
);
export const changeAssetIdentifierRequestSchema = addAssetIdentifierRequestSchema;

export type AssetSummary = z.infer<typeof assetSummarySchema>;
export type AssetDetail = z.infer<typeof assetDetailSchema>;
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
export type AssetListResponse = z.infer<typeof assetListResponseSchema>;
export type CreateAssetRequest = z.infer<typeof createAssetRequestSchema>;
export type UpdateAssetRequest = z.infer<typeof updateAssetRequestSchema>;
export type AssetVersionRequest = z.infer<typeof assetVersionRequestSchema>;
export type SetAssetLifecycleRequest = z.infer<typeof setAssetLifecycleRequestSchema>;
export type AddAssetIdentifierRequest = z.infer<typeof addAssetIdentifierRequestSchema>;
export type ChangeAssetIdentifierRequest = z.infer<typeof changeAssetIdentifierRequestSchema>;
