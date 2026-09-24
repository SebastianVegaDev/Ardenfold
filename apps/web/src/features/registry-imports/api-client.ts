import "server-only";

import {
    registryImportSessionResponseSchema,
    type RegistryImportSessionResponse,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export class ImportApiError extends Error {
    constructor(readonly status: number) {
        super(`Import API request failed (${status}).`);
    }
}

async function request(
    token: string,
    organizationId: string,
    path: string,
    method: "GET" | "POST" = "GET",
    body?: unknown,
): Promise<Response> {
    const response = await fetch(
        new URL(`/api/v1/registry/imports${path}`, getServerEnvironment().ARDENFOLD_API_URL),
        {
            method,
            headers: {
                authorization: `Bearer ${token}`,
                "x-ardenfold-organization-id": organizationId,
                accept: method === "GET" ? "text/csv, application/json" : "application/json",
                ...(body === undefined ? {} : { "content-type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            cache: "no-store",
        },
    );
    if (!response.ok) throw new ImportApiError(response.status);
    return response;
}

export async function previewImport(
    token: string,
    organizationId: string,
    input: { sessionId: string; kind: "party" | "asset"; csv: string },
): Promise<RegistryImportSessionResponse> {
    const response = await request(token, organizationId, "/preview", "POST", input);
    return registryImportSessionResponseSchema.parse(await response.json());
}

export async function getImport(
    token: string,
    organizationId: string,
    sessionId: string,
): Promise<RegistryImportSessionResponse> {
    const response = await request(token, organizationId, `/${sessionId}`);
    return registryImportSessionResponseSchema.parse(await response.json());
}

export async function commitImport(
    token: string,
    organizationId: string,
    sessionId: string,
    approvedRows: number[],
): Promise<RegistryImportSessionResponse> {
    const response = await request(token, organizationId, `/${sessionId}/commit`, "POST", {
        approvedRows,
    });
    return registryImportSessionResponseSchema.parse(await response.json());
}

export async function downloadImportCsv(
    token: string,
    organizationId: string,
    path: string,
): Promise<string> {
    const response = await request(token, organizationId, path);
    return response.text();
}
