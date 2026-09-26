import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/auth/server-organization", () => ({ getActiveOrganizationSession: vi.fn() }));
vi.mock("@/features/assets/api-client", () => ({
    AssetApiError: class extends Error {},
    getAsset: vi.fn(),
    getCurrentRelationships: vi.fn(),
    listAssets: vi.fn(),
}));
vi.mock("./work-order-api", () => ({
    getWorkOrder: vi.fn(),
    mutateWorkOrder: vi.fn(),
    WorkOrderApiError: class extends Error {},
}));

import { getActiveOrganizationSession } from "@/auth/server-organization";
import { listAssets } from "@/features/assets/api-client";

import { getWorkOrder, mutateWorkOrder } from "./work-order-api";
import { workOrderLookup, workOrderMutation } from "./work-order-route";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const context = {
    session: { accessToken: "verified-token" },
    organization: { id: "verified-tenant" },
};
const order = { id: id("10") };
const payload = {
    quoteId: id("1"),
    acceptanceId: id("2"),
    acceptedRevisionId: id("3"),
    expectedQuoteVersion: 2,
    expectedRequestVersion: 1,
    siteId: id("4"),
    reference: "WO-1",
    idempotencyKey: id("5"),
    items: [
        {
            sourceRevisionLineId: id("6"),
            scopeDescription: "Inspect pump",
            allocatedQuantity: "1",
            allocatedUnit: "unit",
            partyId: null,
            assetRequirement: "required",
            assetId: id("7"),
            unresolvedAssetDescription: null,
            serviceMode: "no_intake",
        },
    ],
};

function mutation(value: unknown, origin = "http://localhost:3000") {
    return new NextRequest("http://localhost:3000/auth/work-orders", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(value),
    });
}

beforeEach(() => {
    vi.mocked(getActiveOrganizationSession).mockResolvedValue(
        context as Awaited<ReturnType<typeof getActiveOrganizationSession>>,
    );
    vi.mocked(mutateWorkOrder).mockResolvedValue(
        order as Awaited<ReturnType<typeof mutateWorkOrder>>,
    );
    vi.mocked(getWorkOrder).mockResolvedValue(order as Awaited<ReturnType<typeof getWorkOrder>>);
});

describe("work order web boundary", () => {
    it("rejects cross-origin writes before resolving tenant context", async () => {
        expect(
            (
                await workOrderMutation(
                    mutation({ intent: "create", payload }, "https://untrusted.example"),
                )
            ).status,
        ).toBe(403);
        expect(getActiveOrganizationSession).not.toHaveBeenCalled();
        expect(mutateWorkOrder).not.toHaveBeenCalled();
    });

    it("rejects client tenant identifiers and forwards the exact accepted basis", async () => {
        expect(
            (
                await workOrderMutation(
                    mutation({
                        intent: "create",
                        payload: { ...payload, organizationId: id("9") },
                    }),
                )
            ).status,
        ).toBe(400);
        expect(getActiveOrganizationSession).not.toHaveBeenCalled();
        expect((await workOrderMutation(mutation({ intent: "create", payload }))).status).toBe(200);
        expect(mutateWorkOrder).toHaveBeenCalledWith(
            "verified-token",
            "verified-tenant",
            "/work-orders",
            "POST",
            payload,
        );
    });

    it("routes item restructuring through the verified organization", async () => {
        const restructure = {
            expectedOrderVersion: 2,
            expectedItemVersion: 1,
            reason: "Split",
            replacements: payload.items,
        };
        expect(
            (
                await workOrderMutation(
                    mutation({
                        intent: "restructureItem",
                        orderId: id("10"),
                        itemId: id("11"),
                        payload: restructure,
                    }),
                )
            ).status,
        ).toBe(200);
        expect(mutateWorkOrder).toHaveBeenCalledWith(
            "verified-token",
            "verified-tenant",
            `/work-orders/${id("10")}/items/${id("11")}/restructure`,
            "POST",
            restructure,
        );
    });

    it("keeps asset search under the verified tenant and rejects malformed identifiers", async () => {
        vi.mocked(listAssets).mockResolvedValue({ data: [], nextCursor: null });
        expect(
            (
                await workOrderLookup(
                    new NextRequest("http://localhost:3000/auth/work-orders?id=bad"),
                )
            ).status,
        ).toBe(400);
        expect(
            (
                await workOrderLookup(
                    new NextRequest("http://localhost:3000/auth/work-orders?kind=assets&q=pump"),
                )
            ).status,
        ).toBe(200);
        expect(listAssets).toHaveBeenCalledWith(
            "verified-token",
            "verified-tenant",
            new URLSearchParams({ status: "active", limit: "25", q: "pump" }),
        );
    });
});
