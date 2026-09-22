import type { OrganizationSummary } from "@ardenfold/contracts";

export const activeOrganizationCookie = "ardenfold-organization";

export function resolveActiveOrganization(
    organizations: readonly OrganizationSummary[],
    requestedId: string | undefined,
): OrganizationSummary | undefined {
    return organizations.find((organization) => organization.id === requestedId) ?? organizations[0];
}
