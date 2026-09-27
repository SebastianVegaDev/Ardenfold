import "server-only";

import {
    apiErrorSchema,
    operationalQueueResponseSchema,
    requestTimelineResponseSchema,
    type OperationalQueueResponse,
    type RequestTimelineResponse,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export class OperationalViewApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(`Operational view failed (${status}, ${code}).`);
    }
}

async function read(token: string, organizationId: string, path: string): Promise<unknown> {
    const response = await fetch(
        new URL(`/api/v1${path}`, getServerEnvironment().ARDENFOLD_API_URL),
        {
            headers: {
                authorization: `Bearer ${token}`,
                "x-ardenfold-organization-id": organizationId,
                accept: "application/json",
            },
            cache: "no-store",
        },
    );
    const value: unknown = await response.json();
    if (!response.ok) {
        const error = apiErrorSchema.safeParse(value);
        throw new OperationalViewApiError(
            response.status,
            error.success ? error.data.error.code : "OPERATIONAL_VIEW_REJECTED",
        );
    }
    return value;
}

export async function listOperationalQueue(
    token: string,
    organizationId: string,
    params: URLSearchParams,
): Promise<OperationalQueueResponse> {
    return operationalQueueResponseSchema.parse(
        await read(token, organizationId, `/service-management/queues?${params}`),
    );
}

export async function getRequestTimeline(
    token: string,
    organizationId: string,
    requestId: string,
    params: URLSearchParams,
): Promise<RequestTimelineResponse> {
    return requestTimelineResponseSchema.parse(
        await read(
            token,
            organizationId,
            `/service-management/requests/${requestId}/timeline${params.size ? `?${params}` : ""}`,
        ),
    );
}
