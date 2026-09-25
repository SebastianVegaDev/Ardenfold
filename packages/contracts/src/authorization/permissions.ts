import { z } from "zod";

export const organizationRoleSchema = z.enum(["owner", "administrator", "member", "viewer"]);
export const permissionCodeSchema = z.enum([
    "organization.read",
    "organization.update",
    "sites.read",
    "sites.manage",
    "members.read",
    "members.invite",
    "members.manage",
    "audit.read",
    "parties.read",
    "parties.write",
    "parties.archive",
    "assets.read",
    "assets.write",
    "assets.manage_relationships",
    "assets.archive",
    "registry.import",
    "service_requests.read",
    "service_requests.write",
]);

export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type PermissionCode = z.infer<typeof permissionCodeSchema>;
