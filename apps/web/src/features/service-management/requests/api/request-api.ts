import "server-only";

import {
    apiErrorSchema,
    assetDetailSchema,
    assetListResponseSchema,
    partyDetailSchema,
    partyListResponseSchema,
    serviceRequestDetailSchema,
    serviceRequestListResponseSchema,
    type AssetDetail,
    type AssetListResponse,
    type PartyDetail,
    type PartyListResponse,
    type ServiceRequestDetail,
    type ServiceRequestListResponse,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export class ServiceRequestApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(`Service Request API rejected the operation (${status}, ${code}).`);
    }
}

async function apiRequest(
    token: string,
    organizationId: string,
    path: string,
    method: "GET" | "POST" | "PATCH" = "GET",
    body?: unknown,
): Promise<unknown> {
    const response = await fetch(
        new URL(`/api/v1${path}`, getServerEnvironment().ARDENFOLD_API_URL),
        {
            method,
            headers: {
                authorization: `Bearer ${token}`,
                "x-ardenfold-organization-id": organizationId,
                accept: "application/json",
                ...(body === undefined ? {} : { "content-type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            cache: "no-store",
        },
    );
    const value: unknown = await response.json();
    if (!response.ok) {
        const parsed = apiErrorSchema.safeParse(value);
        throw new ServiceRequestApiError(
            response.status,
            parsed.success ? parsed.data.error.code : "REQUEST_REJECTED",
        );
    }
    return value;
}

function suffix(params: URLSearchParams): string {
    return params.size ? `?${params.toString()}` : "";
}

export async function listServiceRequests(
    token: string,
    organizationId: string,
    params: URLSearchParams,
): Promise<ServiceRequestListResponse> {
    return serviceRequestListResponseSchema.parse(
        await apiRequest(token, organizationId, `/service-requests${suffix(params)}`),
    );
}

export async function getServiceRequest(
    token: string,
    organizationId: string,
    id: string,
): Promise<ServiceRequestDetail> {
    return serviceRequestDetailSchema.parse(
        await apiRequest(token, organizationId, `/service-requests/${id}`),
    );
}

export async function mutateServiceRequest(
    token: string,
    organizationId: string,
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
): Promise<ServiceRequestDetail> {
    return serviceRequestDetailSchema.parse(
        await apiRequest(token, organizationId, path, method, body),
    );
}

export async function findCustomers(
    token: string,
    organizationId: string,
    query: string,
): Promise<PartyListResponse> {
    const params = new URLSearchParams({ role: "customer", status: "active", limit: "25" });
    if (query) params.set("q", query);
    return partyListResponseSchema.parse(
        await apiRequest(token, organizationId, `/parties${suffix(params)}`),
    );
}

export async function getCustomer(
    token: string,
    organizationId: string,
    id: string,
): Promise<PartyDetail> {
    return partyDetailSchema.parse(await apiRequest(token, organizationId, `/parties/${id}`));
}

export async function findAssets(
    token: string,
    organizationId: string,
    query: string,
): Promise<AssetListResponse> {
    const params = new URLSearchParams({ status: "active", limit: "25" });
    if (query) params.set("q", query);
    return assetListResponseSchema.parse(
        await apiRequest(token, organizationId, `/assets${suffix(params)}`),
    );
}

export async function getKnownAsset(
    token: string,
    organizationId: string,
    id: string,
): Promise<AssetDetail> {
    return assetDetailSchema.parse(await apiRequest(token, organizationId, `/assets/${id}`));
}
