import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/auth/server-organization", () => ({ getActiveOrganizationSession: vi.fn() }));
vi.mock("./request-api", () => ({
    findAssets: vi.fn(),
    findCustomers: vi.fn(),
    getCustomer: vi.fn(),
    getKnownAsset: vi.fn(),
    getServiceRequest: vi.fn(),
    mutateServiceRequest: vi.fn(),
    ServiceRequestApiError: class extends Error {},
}));

import { getActiveOrganizationSession } from "@/auth/server-organization";
import { findCustomers, mutateServiceRequest } from "./request-api";
import { requestLookup, requestMutation } from "./request-route";

const customerId = "00000000-0000-4000-8000-000000000001";
const payload = { customerPartyId: customerId, summary: "Inspect unknown unit" };
const context = {
    session: { accessToken: "verified-token" },
    organization: { id: "verified-organization" },
};

beforeEach(() => {
    vi.mocked(getActiveOrganizationSession).mockResolvedValue(
        context as Awaited<ReturnType<typeof getActiveOrganizationSession>>,
    );
});

function mutation(body: unknown, origin = "http://localhost:3000") {
    return new NextRequest("http://localhost:3000/auth/service-requests", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("Service Request web boundary", () => {
    it("rejects cross-origin mutations before accessing the session or API", async () => {
        const response = await requestMutation(
            mutation({ intent: "create", payload }, "https://untrusted.example"),
        );
        expect(response.status).toBe(403);
        expect(getActiveOrganizationSession).not.toHaveBeenCalled();
        expect(mutateServiceRequest).not.toHaveBeenCalled();
    });

    it("rejects mutable tenant ownership and validates the authoritative request contract", async () => {
        const response = await requestMutation(
            mutation({ intent: "create", payload: { ...payload, organizationId: customerId } }),
        );
        expect(response.status).toBe(400);
        expect(mutateServiceRequest).not.toHaveBeenCalled();
    });

    it("uses the verified active organization for mutation and lookup", async () => {
        vi.mocked(mutateServiceRequest).mockResolvedValue({ id: customerId } as Awaited<
            ReturnType<typeof mutateServiceRequest>
        >);
        vi.mocked(findCustomers).mockResolvedValue({ data: [], nextCursor: null });
        expect((await requestMutation(mutation({ intent: "create", payload }))).status).toBe(200);
        expect(mutateServiceRequest).toHaveBeenCalledWith(
            "verified-token",
            "verified-organization",
            "/service-requests",
            "POST",
            { ...payload, scopeItems: [] },
        );
        await requestLookup(
            new NextRequest(
                "http://localhost:3000/auth/service-requests?kind=customers&q=motor&organizationId=untrusted",
            ),
        );
        expect(findCustomers).toHaveBeenCalledWith(
            "verified-token",
            "verified-organization",
            "motor",
        );
    });
});
