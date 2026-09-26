import "server-only";

import {
    apiErrorSchema,
    quoteAcceptanceSchema,
    quoteDetailSchema,
    quoteListResponseSchema,
    type QuoteDetail,
    type QuoteListResponse,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export class QuoteApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(`Quotation API rejected the operation (${status}, ${code}).`);
    }
}

async function request(
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
        const error = apiErrorSchema.safeParse(value);
        throw new QuoteApiError(
            response.status,
            error.success ? error.data.error.code : "QUOTE_REJECTED",
        );
    }
    return value;
}

export async function listQuotes(
    token: string,
    organizationId: string,
    params: URLSearchParams,
): Promise<QuoteListResponse> {
    return quoteListResponseSchema.parse(
        await request(token, organizationId, `/quotations${params.size ? `?${params}` : ""}`),
    );
}

export async function getQuote(
    token: string,
    organizationId: string,
    quoteId: string,
): Promise<QuoteDetail> {
    return quoteDetailSchema.parse(await request(token, organizationId, `/quotations/${quoteId}`));
}

export async function mutateQuote(
    token: string,
    organizationId: string,
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
): Promise<QuoteDetail | QuoteDetail["acceptances"][number]> {
    const result = await request(token, organizationId, path, method, body);
    return path.endsWith("/acceptances")
        ? quoteAcceptanceSchema.parse(result)
        : quoteDetailSchema.parse(result);
}
