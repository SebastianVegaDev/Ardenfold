import "server-only";

import {
    partyDetailSchema,
    partyListResponseSchema,
    partySummarySchema,
    type PartyDetail,
    type PartyListResponse,
    type PartySummary,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export class PartyApiError extends Error {
    constructor(readonly status: number) {
        super(`Party API request failed (${status}).`);
    }
}

async function partyRequest(
    accessToken: string,
    organizationId: string,
    path: string,
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET",
    body?: unknown,
): Promise<Response> {
    const environment = getServerEnvironment();
    const response = await fetch(new URL(`/api/v1${path}`, environment.ARDENFOLD_API_URL), {
        method,
        headers: {
            authorization: `Bearer ${accessToken}`,
            "x-ardenfold-organization-id": organizationId,
            accept: "application/json",
            ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
    });

    if (!response.ok) throw new PartyApiError(response.status);
    return response;
}

export async function listParties(
    accessToken: string,
    organizationId: string,
    params: URLSearchParams,
): Promise<PartyListResponse> {
    const suffix = params.size ? `?${params.toString()}` : "";
    const response = await partyRequest(accessToken, organizationId, `/parties${suffix}`);
    return partyListResponseSchema.parse(await response.json());
}

export async function getParty(
    accessToken: string,
    organizationId: string,
    partyId: string,
): Promise<PartyDetail> {
    const response = await partyRequest(accessToken, organizationId, `/parties/${partyId}`);
    return partyDetailSchema.parse(await response.json());
}

export async function mutateParty(
    accessToken: string,
    organizationId: string,
    path: string,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    body: unknown,
): Promise<PartySummary | PartyDetail> {
    const response = await partyRequest(accessToken, organizationId, path, method, body);
    const value: unknown = await response.json();
    const detail = partyDetailSchema.safeParse(value);
    return detail.success ? detail.data : partySummarySchema.parse(value);
}
