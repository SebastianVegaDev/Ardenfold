import { z } from "zod";

import { identifierSchema, instantSchema } from "../../shared/primitives";

const id = identifierSchema;
const version = z.number().int().positive();
const description = z.string().trim().min(1).max(10_000);

export const serviceRequestStatusSchema = z.enum(["active", "cancelled", "closed"]);

export const serviceRequestScopeItemSchema = z.strictObject({
    id,
    position: z.number().int().positive(),
    description,
    assetId: id.nullable(),
    unidentifiedAssetDescription: description.nullable(),
});

export const serviceRequestSummarySchema = z.strictObject({
    id,
    customerPartyId: id,
    requesterContactId: id.nullable(),
    siteId: id.nullable(),
    summary: z.string().trim().min(1).max(300),
    status: serviceRequestStatusSchema,
    version,
    createdAt: instantSchema,
    updatedAt: instantSchema,
    terminalAt: instantSchema.nullable(),
});

export const serviceRequestDetailSchema = serviceRequestSummarySchema.extend({
    requesterName: z.string().trim().min(1).max(200).nullable(),
    customerContext: description.nullable(),
    terminalReason: description.nullable(),
    scopeItems: z.array(serviceRequestScopeItemSchema),
});

const inputScopeItem = z.strictObject({
    description,
    assetId: id.nullable().optional(),
    unidentifiedAssetDescription: description.nullable().optional(),
});

export const createServiceRequestSchema = z.strictObject({
    customerPartyId: id,
    requesterContactId: id.nullable().optional(),
    requesterName: z.string().trim().min(1).max(200).nullable().optional(),
    siteId: id.nullable().optional(),
    summary: z.string().trim().min(1).max(300),
    customerContext: description.nullable().optional(),
    scopeItems: z.array(inputScopeItem).max(100).default([]),
});

export const updateServiceRequestSchema = z
    .strictObject({
        expectedVersion: version,
        reason: z.string().trim().min(1).max(1_000),
        customerPartyId: id.optional(),
        requesterContactId: id.nullable().optional(),
        requesterName: z.string().trim().min(1).max(200).nullable().optional(),
        siteId: id.nullable().optional(),
        summary: z.string().trim().min(1).max(300).optional(),
        customerContext: description.nullable().optional(),
        scopeItems: z
            .array(inputScopeItem.extend({ id: id.optional() }))
            .max(100)
            .optional(),
    })
    .refine((input) =>
        Object.keys(input).some((key) => key !== "expectedVersion" && key !== "reason"),
    );

export const transitionServiceRequestSchema = z.strictObject({
    expectedVersion: version,
    reason: z.string().trim().min(1).max(1_000),
});

export const serviceRequestListQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    status: serviceRequestStatusSchema.optional(),
    customerPartyId: id.optional(),
    siteId: id.optional(),
    assetId: id.optional(),
    q: z.string().trim().min(2).max(100).optional(),
    createdFrom: instantSchema.optional(),
    createdTo: instantSchema.optional(),
    sort: z.enum(["newest", "oldest"]).optional(),
});

export const serviceRequestListResponseSchema = z.strictObject({
    data: z.array(serviceRequestSummarySchema),
    nextCursor: z.string().nullable(),
});

export type ServiceRequestDetail = z.infer<typeof serviceRequestDetailSchema>;
export type ServiceRequestSummary = z.infer<typeof serviceRequestSummarySchema>;
export type ServiceRequestListQuery = z.infer<typeof serviceRequestListQuerySchema>;
export type ServiceRequestListResponse = z.infer<typeof serviceRequestListResponseSchema>;
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;
export type TransitionServiceRequest = z.infer<typeof transitionServiceRequestSchema>;
