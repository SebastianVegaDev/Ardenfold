import {
    assetCurrentRelationshipsSchema,
    assetDetailSchema,
    assetListResponseSchema,
    workOrderDetailSchema,
    type AssetCurrentRelationships,
    type AssetDetail,
    type AssetListResponse,
    type WorkOrderDetail,
} from "@ardenfold/contracts";

export class WorkOrderWebError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(code);
    }
}

async function read(response: Response): Promise<unknown> {
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
                : "WORK_ORDER_REJECTED";
        throw new WorkOrderWebError(response.status, code);
    }
    return value;
}

export async function fetchCurrentWorkOrder(id: string): Promise<WorkOrderDetail> {
    return workOrderDetailSchema.parse(
        await read(
            await fetch(`/auth/work-orders?id=${encodeURIComponent(id)}`, { cache: "no-store" }),
        ),
    );
}

export async function searchWorkAssets(query: string): Promise<AssetListResponse> {
    const params = new URLSearchParams({ kind: "assets", q: query });
    return assetListResponseSchema.parse(
        await read(await fetch(`/auth/work-orders?${params}`, { cache: "no-store" })),
    );
}

export async function fetchWorkAsset(id: string): Promise<AssetDetail> {
    const params = new URLSearchParams({ kind: "asset", id });
    return assetDetailSchema.parse(
        await read(await fetch(`/auth/work-orders?${params}`, { cache: "no-store" })),
    );
}

export async function fetchAssetRelationships(id: string): Promise<AssetCurrentRelationships> {
    const params = new URLSearchParams({ kind: "relationships", id });
    return assetCurrentRelationshipsSchema.parse(
        await read(await fetch(`/auth/work-orders?${params}`, { cache: "no-store" })),
    );
}

export async function submitWorkOrder(value: unknown): Promise<WorkOrderDetail> {
    return workOrderDetailSchema.parse(
        await read(
            await fetch("/auth/work-orders", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(value),
            }),
        ),
    );
}
