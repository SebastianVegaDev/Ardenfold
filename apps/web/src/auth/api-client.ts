import {
    authenticatedUserResponseSchema,
    type AuthenticatedUserResponse,
    organizationListResponseSchema,
    activeOrganizationResponseSchema,
    type ActiveOrganizationResponse,
    organizationInvitationListResponseSchema,
    organizationMemberListResponseSchema,
    organizationSiteListResponseSchema,
    organizationSummarySchema,
    type OrganizationSummary,
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

async function requestApi(
    accessToken: string,
    path: string,
    options: Readonly<{
        method?: "GET" | "POST" | "PATCH" | "DELETE";
        organizationId?: string;
        body?: unknown;
    }> = {},
): Promise<Response> {
    const environment = getServerEnvironment();
    const headers: Record<string, string> = {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
    };

    if (options.organizationId) {
        headers["x-ardenfold-organization-id"] = options.organizationId;
    }

    if (options.body !== undefined) {
        headers["content-type"] = "application/json";
    }

    return fetch(new URL(path, environment.ARDENFOLD_API_URL), {
        method: options.method ?? "GET",
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        cache: "no-store",
    });
}

export async function getOrganizationManagementData(accessToken: string, organizationId: string) {
    const [membersResponse, sitesResponse, invitationsResponse] = await Promise.all([
        requestApi(accessToken, "/api/v1/organizations/current/members", { organizationId }),
        requestApi(accessToken, "/api/v1/organizations/current/sites", { organizationId }),
        requestApi(accessToken, "/api/v1/organizations/current/invitations", { organizationId }),
    ]);

    if (!membersResponse.ok || !sitesResponse.ok || !invitationsResponse.ok) {
        throw new Error("Ardenfold API could not load organization management data.");
    }

    const members: unknown = await membersResponse.json();
    const sites: unknown = await sitesResponse.json();
    const invitations: unknown = await invitationsResponse.json();

    return {
        members: organizationMemberListResponseSchema.parse(members),
        sites: organizationSiteListResponseSchema.parse(sites),
        invitations: organizationInvitationListResponseSchema.parse(invitations),
    };
}

export async function createOrganization(
    accessToken: string,
    body: unknown,
): Promise<OrganizationSummary> {
    const response = await requestApi(accessToken, "/api/v1/organizations", {
        method: "POST",
        body,
    });

    if (!response.ok) throw new Error(`Organization creation failed (${response.status}).`);
    return organizationSummarySchema.parse(await response.json());
}

export async function mutateOrganization(
    accessToken: string,
    organizationId: string,
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
): Promise<unknown> {
    const response = await requestApi(accessToken, path, {
        method,
        organizationId,
        ...(body === undefined ? {} : { body }),
    });

    if (!response.ok) {
        throw new Error(`Organization operation failed (${response.status}).`);
    }

    return response.status === 204 ? undefined : response.json();
}

export async function acceptOrganizationInvitation(
    accessToken: string,
    token: string,
): Promise<{ organizationId: string }> {
    const response = await requestApi(accessToken, "/api/v1/invitations/accept", {
        method: "POST",
        body: { token },
    });

    if (!response.ok) throw new Error(`Invitation acceptance failed (${response.status}).`);
    return (await response.json()) as { organizationId: string };
}
