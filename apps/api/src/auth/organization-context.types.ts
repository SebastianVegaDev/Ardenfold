import type { PermissionCode, OrganizationRole } from "@ardenfold/contracts";

export const organizationHeader = "x-ardenfold-organization-id";

export type ActiveOrganizationContext = Readonly<{
    id: string;
    name: string;
    defaultLocale: string;
    defaultTimeZone: string;
    role: OrganizationRole;
    permissions: readonly PermissionCode[];
}>;

declare module "fastify" {
    interface FastifyRequest {
        organizationContext?: ActiveOrganizationContext;
    }
}
