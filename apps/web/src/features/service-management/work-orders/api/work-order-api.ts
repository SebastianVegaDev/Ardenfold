import "server-only";

import {
    apiErrorSchema,
    workOrderDetailSchema,
    workOrderListResponseSchema,
    workOrderReadinessResponseSchema,
    type WorkOrderDetail,
    type WorkOrderListResponse,
    type WorkOrderReadinessResponse,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export class WorkOrderApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(`Work Order API rejected the operation (${status}, ${code}).`);
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
        throw new WorkOrderApiError(
            response.status,
            error.success ? error.data.error.code : "WORK_ORDER_REJECTED",
        );
    }
    return value;
}

export async function listWorkOrders(
    token: string,
    organizationId: string,
    params: URLSearchParams,
): Promise<WorkOrderListResponse> {
    return workOrderListResponseSchema.parse(
        await request(token, organizationId, `/work-orders${params.size ? `?${params}` : ""}`),
    );
}

export async function getWorkOrder(
    token: string,
    organizationId: string,
    orderId: string,
): Promise<WorkOrderDetail> {
    return workOrderDetailSchema.parse(
        await request(token, organizationId, `/work-orders/${orderId}`),
    );
}

export async function getWorkOrderReadiness(
    token: string,
    organizationId: string,
    orderId: string,
): Promise<WorkOrderReadinessResponse> {
    return workOrderReadinessResponseSchema.parse(
        await request(token, organizationId, `/work-orders/${orderId}/readiness`),
    );
}

export async function mutateWorkOrder(
    token: string,
    organizationId: string,
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
): Promise<WorkOrderDetail> {
    return workOrderDetailSchema.parse(await request(token, organizationId, path, method, body));
}
