import {
    assetListResponseSchema,
    partyDetailSchema,
    partyListResponseSchema,
    serviceRequestDetailSchema,
    type AssetListResponse,
    type PartyDetail,
    type PartyListResponse,
    type ServiceRequestDetail,
} from "@ardenfold/contracts";

export class RequestWebError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(code);
    }
}

async function readResponse(response: Response): Promise<unknown> {
    const value: unknown = await response.json();
    if (!response.ok) {
        const code =
            typeof value === "object" &&
            value !== null &&
            "error" in value &&
            typeof value.error === "object" &&
            value.error !== null &&
            "code" in value.error &&
            typeof value.error.code === "string"
                ? value.error.code
                : "REQUEST_REJECTED";
        throw new RequestWebError(response.status, code);
    }
    return value;
}

async function lookup(kind: string, value: string, key: "q" | "id"): Promise<unknown> {
    const params = new URLSearchParams({ kind, [key]: value });
    return readResponse(
        await fetch(`/auth/service-requests?${params.toString()}`, { cache: "no-store" }),
    );
}

export async function searchCustomers(query: string): Promise<PartyListResponse> {
    return partyListResponseSchema.parse(await lookup("customers", query, "q"));
}

export async function selectCustomer(id: string): Promise<PartyDetail> {
    return partyDetailSchema.parse(await lookup("customer", id, "id"));
}

export async function searchAssets(query: string): Promise<AssetListResponse> {
    return assetListResponseSchema.parse(await lookup("assets", query, "q"));
}

export async function fetchCurrentRequest(id: string): Promise<ServiceRequestDetail> {
    return serviceRequestDetailSchema.parse(await lookup("request", id, "id"));
}

export async function submitRequest(value: unknown): Promise<ServiceRequestDetail> {
    return serviceRequestDetailSchema.parse(
        await readResponse(
            await fetch("/auth/service-requests", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(value),
            }),
        ),
    );
}
