import {
    authenticatedUserResponseSchema,
    type AuthenticatedUserResponse,
    organizationListResponseSchema,
    activeOrganizationResponseSchema,
    type ActiveOrganizationResponse,
    type OrganizationListResponse,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export async function getAuthenticatedUser(accessToken: string): Promise<AuthenticatedUserResponse> {
    const environment = getServerEnvironment();
    const response = await fetch(new URL("/api/v1/auth/me", environment.ARDENFOLD_API_URL), {
        headers: {
            authorization: `Bearer ${accessToken}`,
            accept: "application/json",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Ardenfold API rejected the authenticated session (${response.status}).`);
    }

    return authenticatedUserResponseSchema.parse(await response.json());
}

export async function getAccessibleOrganizations(
    accessToken: string,
): Promise<OrganizationListResponse> {
    const environment = getServerEnvironment();
    const response = await fetch(new URL("/api/v1/organizations", environment.ARDENFOLD_API_URL), {
        headers: {
            authorization: `Bearer ${accessToken}`,
            accept: "application/json",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Ardenfold API could not resolve organization access (${response.status}).`);
    }

    return organizationListResponseSchema.parse(await response.json());
}

export async function getActiveOrganization(
    accessToken: string,
    organizationId: string,
): Promise<ActiveOrganizationResponse> {
    const environment = getServerEnvironment();
    const response = await fetch(
        new URL("/api/v1/organizations/current", environment.ARDENFOLD_API_URL),
        {
            headers: {
                authorization: `Bearer ${accessToken}`,
                accept: "application/json",
                "x-ardenfold-organization-id": organizationId,
            },
            cache: "no-store",
        },
    );

    if (!response.ok) {
        throw new Error(`Ardenfold API rejected the active organization (${response.status}).`);
    }

    return activeOrganizationResponseSchema.parse(await response.json());
}
