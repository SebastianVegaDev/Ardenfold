import "server-only";

import {
    apiErrorSchema,
    receiptDetailSchema,
    receiptListResponseSchema,
    type ReceiptDetail,
    type ReceiptListResponse,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export class ReceiptApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(`Receipt API rejected the operation (${status}, ${code}).`);
    }
}

async function request(
    token: string,
    organizationId: string,
    path: string,
    body?: unknown,
): Promise<unknown> {
    const response = await fetch(
        new URL(`/api/v1${path}`, getServerEnvironment().ARDENFOLD_API_URL),
        {
            method: body === undefined ? "GET" : "POST",
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
        throw new ReceiptApiError(
            response.status,
            error.success ? error.data.error.code : "RECEIPT_REJECTED",
        );
    }
    return value;
}

export async function listReceipts(
    token: string,
    organizationId: string,
    orderId: string,
): Promise<ReceiptListResponse> {
    return receiptListResponseSchema.parse(
        await request(token, organizationId, `/receipts/work-orders/${orderId}`),
    );
}

export async function getReceipt(
    token: string,
    organizationId: string,
    receiptId: string,
): Promise<ReceiptDetail> {
    return receiptDetailSchema.parse(
        await request(token, organizationId, `/receipts/${receiptId}`),
    );
}

export async function mutateReceipt(
    token: string,
    organizationId: string,
    path: string,
    body: unknown,
): Promise<ReceiptDetail> {
    return receiptDetailSchema.parse(await request(token, organizationId, path, body));
}
