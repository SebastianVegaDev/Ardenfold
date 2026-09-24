import "server-only";

import {
    assetCurrentRelationshipsSchema,
    assetDetailSchema,
    assetHistoryResponseSchema,
    assetListResponseSchema,
    assetRelationshipHistoryResponseSchema,
    organizationSiteListResponseSchema,
    type AssetCurrentRelationships,
    type AssetDetail,
    type AssetHistoryResponse,
    type AssetListResponse,
    type AssetRelationshipHistoryResponse,
    type OrganizationSiteListResponse,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export class AssetApiError extends Error {
    constructor(readonly status: number) {
        super(`Asset API request failed (${status}).`);
    }
}

async function assetRequest(
    accessToken: string,
    organizationId: string,
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
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
    if (!response.ok) throw new AssetApiError(response.status);
    return response;
}

export async function listAssets(
    token: string,
    organizationId: string,
    params: URLSearchParams,
): Promise<AssetListResponse> {
    const suffix = params.size ? `?${params.toString()}` : "";
    const response = await assetRequest(token, organizationId, `/assets${suffix}`);
    return assetListResponseSchema.parse(await response.json());
}

export async function getAsset(
    token: string,
    organizationId: string,
    assetId: string,
): Promise<AssetDetail> {
    const response = await assetRequest(token, organizationId, `/assets/${assetId}`);
    return assetDetailSchema.parse(await response.json());
}

export async function getCurrentRelationships(
    token: string,
    organizationId: string,
    assetId: string,
): Promise<AssetCurrentRelationships> {
    const response = await assetRequest(
        token,
        organizationId,
        `/assets/${assetId}/relationships/current`,
    );
    return assetCurrentRelationshipsSchema.parse(await response.json());
}

export async function getAssetHistory(
    token: string,
    organizationId: string,
    assetId: string,
    params: URLSearchParams = new URLSearchParams(),
): Promise<AssetHistoryResponse> {
    const suffix = params.size ? `?${params.toString()}` : "";
    const response = await assetRequest(
        token,
        organizationId,
        `/assets/${assetId}/history${suffix}`,
    );
    return assetHistoryResponseSchema.parse(await response.json());
}

export async function getRelationshipHistory(
    token: string,
    organizationId: string,
    assetId: string,
    params: URLSearchParams = new URLSearchParams(),
): Promise<AssetRelationshipHistoryResponse> {
    const suffix = params.size ? `?${params.toString()}` : "";
    const response = await assetRequest(
        token,
        organizationId,
        `/assets/${assetId}/relationships/history${suffix}`,
    );
    return assetRelationshipHistoryResponseSchema.parse(await response.json());
}

export async function listAvailableSites(
    token: string,
    organizationId: string,
): Promise<OrganizationSiteListResponse> {
    const response = await assetRequest(token, organizationId, "/organizations/current/sites");
    return organizationSiteListResponseSchema.parse(await response.json());
}

export async function mutateAsset(
    token: string,
    organizationId: string,
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
): Promise<AssetDetail | AssetCurrentRelationships> {
    const response = await assetRequest(token, organizationId, path, method, body);
    const value: unknown = await response.json();
    const asset = assetDetailSchema.safeParse(value);
    return asset.success ? asset.data : assetCurrentRelationshipsSchema.parse(value);
}
