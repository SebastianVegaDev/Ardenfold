import { z } from "zod";

import { organizationRoleSchema, permissionCodeSchema } from "../authorization/permissions";
import { identifierSchema } from "../shared/primitives";

const organizationNameSchema = z.string().trim().min(1).max(200);
const optionalCodeSchema = z.string().trim().min(1).max(64).nullable();

export const organizationSummarySchema = z.strictObject({
    id: identifierSchema,
    name: organizationNameSchema,
    defaultLocale: z.string().min(1),
    defaultTimeZone: z.string().min(1),
    role: organizationRoleSchema,
});
export const organizationListResponseSchema = z.strictObject({
    data: z.array(organizationSummarySchema),
});
export const activeOrganizationResponseSchema = organizationSummarySchema.extend({
    permissions: z.array(permissionCodeSchema),
});
export const createOrganizationRequestSchema = z.strictObject({
    name: organizationNameSchema,
    defaultLocale: z.enum(["en", "es"]),
    defaultTimeZone: z.string().trim().min(1).max(255),
});
export const updateOrganizationRequestSchema = createOrganizationRequestSchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
        message: "At least one field is required.",
    });
export const organizationSiteSchema = z.strictObject({
    id: identifierSchema,
    organizationId: identifierSchema,
    name: organizationNameSchema,
    code: optionalCodeSchema,
    timeZone: z.string().min(1).max(255).nullable(),
    isActive: z.boolean(),
});
export const createOrganizationSiteRequestSchema = z.strictObject({
    name: organizationNameSchema,
    code: optionalCodeSchema.optional(),
    timeZone: z.string().trim().min(1).max(255).nullable().optional(),
});
export const organizationSiteListResponseSchema = z.strictObject({
    data: z.array(organizationSiteSchema),
});

export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;
export type OrganizationListResponse = z.infer<typeof organizationListResponseSchema>;
export type ActiveOrganizationResponse = z.infer<typeof activeOrganizationResponseSchema>;
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;
export type OrganizationSite = z.infer<typeof organizationSiteSchema>;
export type CreateOrganizationSiteRequest = z.infer<typeof createOrganizationSiteRequestSchema>;
export type OrganizationSiteListResponse = z.infer<typeof organizationSiteListResponseSchema>;
