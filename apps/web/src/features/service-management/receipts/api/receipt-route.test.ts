import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/auth/server-organization", () => ({ getActiveOrganizationSession: vi.fn() }));
vi.mock("./receipt-api", () => ({
    getReceipt: vi.fn(),
    mutateReceipt: vi.fn(),
    ReceiptApiError: class extends Error {},
}));

import { getActiveOrganizationSession } from "@/auth/server-organization";

import { getReceipt, mutateReceipt } from "./receipt-api";
import { receiptLookup, receiptMutation } from "./receipt-route";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const context = {
    session: { accessToken: "verified-token" },
    organization: { id: "verified-tenant" },
};
const receipt = { id: id("10") };
const payload = {
    workOrderId: id("1"),
    expectedOrderVersion: 2,
    itemIds: [id("2")],
    assetId: null,
    intakeDescription: "Received without tag",
    observedCondition: "Scratched case",
    accessories: ["Cable"],
    receivedAt: "2026-01-02T00:00:00.000Z",
    responsibleActorName: "Technician",
    responsiblePartyId: null,
    coordination: {},
    idempotencyKey: id("3"),
};
function mutation(value: unknown, origin = "http://localhost:3000") {
    return new NextRequest("http://localhost:3000/auth/receipts", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(value),
    });
}

beforeEach(() => {
    vi.mocked(getActiveOrganizationSession).mockResolvedValue(
        context as Awaited<ReturnType<typeof getActiveOrganizationSession>>,
    );
    vi.mocked(mutateReceipt).mockResolvedValue(
        receipt as Awaited<ReturnType<typeof mutateReceipt>>,
    );
    vi.mocked(getReceipt).mockResolvedValue(receipt as Awaited<ReturnType<typeof getReceipt>>);
});

describe("receipt web boundary", () => {
    it("rejects cross-origin writes and client tenant identifiers", async () => {
        expect(
            (
                await receiptMutation(
                    mutation({ intent: "create", payload }, "https://untrusted.example"),
                )
            ).status,
        ).toBe(403);
        expect(
            (
                await receiptMutation(
                    mutation({
                        intent: "create",
                        payload: { ...payload, organizationId: id("9") },
                    }),
                )
            ).status,
        ).toBe(400);
        expect(getActiveOrganizationSession).not.toHaveBeenCalled();
    });

    it("creates intake and corrects it only through verified tenant context", async () => {
        expect((await receiptMutation(mutation({ intent: "create", payload }))).status).toBe(200);
        expect(mutateReceipt).toHaveBeenCalledWith(
            "verified-token",
            "verified-tenant",
            "/receipts",
            payload,
        );
        const correction = {
            expectedVersion: 1,
            expectedOrderVersion: 2,
            idempotencyKey: id("4"),
            reason: "Observed again",
            observedCondition: "Clean",
        };
        expect(
            (
                await receiptMutation(
                    mutation({ intent: "correct", receiptId: receipt.id, payload: correction }),
                )
            ).status,
        ).toBe(200);
        expect(mutateReceipt).toHaveBeenCalledWith(
            "verified-token",
            "verified-tenant",
            `/receipts/${receipt.id}/correct`,
            correction,
        );
        await receiptLookup(
            new NextRequest(
                `http://localhost:3000/auth/receipts?id=${receipt.id}&organizationId=untrusted`,
            ),
        );
        expect(getReceipt).toHaveBeenCalledWith("verified-token", "verified-tenant", receipt.id);
    });
});
