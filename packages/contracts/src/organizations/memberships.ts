import { z } from "zod";

import { organizationRoleSchema } from "../authorization/permissions";
import { identifierSchema } from "../shared/primitives";

export const organizationMemberSchema = z.strictObject({
    membershipId: identifierSchema,
    userId: identifierSchema,
    email: z.email(),
    displayName: z.string().min(1).nullable(),
    role: organizationRoleSchema,
    status: z.enum(["active", "suspended", "removed"]),
});
export const organizationMemberListResponseSchema = z.strictObject({
    data: z.array(organizationMemberSchema),
});
export const updateMembershipRoleRequestSchema = z.strictObject({ role: organizationRoleSchema });

export type OrganizationMember = z.infer<typeof organizationMemberSchema>;
export type OrganizationMemberListResponse = z.infer<typeof organizationMemberListResponseSchema>;
export type UpdateMembershipRoleRequest = z.infer<typeof updateMembershipRoleRequestSchema>;
