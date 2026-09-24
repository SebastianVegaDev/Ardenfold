import { z } from "zod";

import { organizationRoleSchema } from "../authorization/permissions";
import { identifierSchema, instantSchema } from "../shared/primitives";

export const createInvitationRequestSchema = z.strictObject({
    email: z.email().transform((value) => value.trim().toLowerCase()),
    role: organizationRoleSchema,
});
export const organizationInvitationSchema = z.strictObject({
    id: identifierSchema,
    email: z.email(),
    role: organizationRoleSchema,
    status: z.enum(["pending", "accepted", "cancelled", "expired"]),
    expiresAt: instantSchema,
});
export const createdInvitationResponseSchema = organizationInvitationSchema.extend({
    acceptanceToken: z.string().min(32),
});
export const organizationInvitationListResponseSchema = z.strictObject({
    data: z.array(organizationInvitationSchema),
});
export const acceptInvitationRequestSchema = z.strictObject({ token: z.string().min(32).max(512) });

export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;
export type OrganizationInvitation = z.infer<typeof organizationInvitationSchema>;
export type CreatedInvitationResponse = z.infer<typeof createdInvitationResponseSchema>;
export type OrganizationInvitationListResponse = z.infer<
    typeof organizationInvitationListResponseSchema
>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
