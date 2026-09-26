import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { quote, requestId, revisionId } from "../test/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/auth/server-organization", () => ({ getActiveOrganizationSession: vi.fn() }));
vi.mock("./quote-api", () => ({
    getQuote: vi.fn(),
    mutateQuote: vi.fn(),
    QuoteApiError: class extends Error {},
}));

import { getActiveOrganizationSession } from "@/auth/server-organization";
import { getQuote, mutateQuote } from "./quote-api";
import { quoteLookup, quoteMutation } from "./quote-route";

const context = {
    session: { accessToken: "verified-token" },
    organization: { id: "verified-tenant" },
};

function mutation(value: unknown, origin = "http://localhost:3000") {
    return new NextRequest("http://localhost:3000/auth/quotations", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(value),
    });
}

beforeEach(() => {
    vi.mocked(getActiveOrganizationSession).mockResolvedValue(
        context as Awaited<ReturnType<typeof getActiveOrganizationSession>>,
    );
    vi.mocked(mutateQuote).mockResolvedValue(quote);
    vi.mocked(getQuote).mockResolvedValue(quote);
});

describe("quotation web boundary", () => {
    it("rejects cross-origin writes before obtaining tenant context", async () => {
        expect(
            (await quoteMutation(mutation({ intent: "close" }, "https://untrusted.example")))
                .status,
        ).toBe(403);
        expect(getActiveOrganizationSession).not.toHaveBeenCalled();
        expect(mutateQuote).not.toHaveBeenCalled();
    });

    it("rejects mutable organization identifiers in contract payloads", async () => {
        const response = await quoteMutation(
            mutation({
                intent: "create",
                payload: {
                    requestId,
                    reference: "Q-1",
                    organizationId: "untrusted",
                    draft: {
                        currencyCode: "PEN",
                        paymentTerms: null,
                        deliveryTerms: null,
                        serviceLocation: null,
                        intakeExpectations: null,
                        exclusions: null,
                        validUntil: null,
                        lines: [],
                        adjustments: [],
                    },
                },
            }),
        );
        expect(response.status).toBe(400);
        expect(getActiveOrganizationSession).not.toHaveBeenCalled();
    });

    it("creates on the collection endpoint using only verified tenant context", async () => {
        const payload = {
            requestId,
            reference: "Q-1",
            draft: {
                currencyCode: "PEN",
                paymentTerms: null,
                deliveryTerms: null,
                serviceLocation: null,
                intakeExpectations: null,
                exclusions: null,
                validUntil: null,
                lines: [],
                adjustments: [],
            },
        };
        expect((await quoteMutation(mutation({ intent: "create", payload }))).status).toBe(200);
        expect(mutateQuote).toHaveBeenCalledWith(
            "verified-token",
            "verified-tenant",
            "/quotations",
            "POST",
            payload,
        );
    });

    it("uses verified tenant context and a fixed path for exact-revision acceptance", async () => {
        const payload = {
            expectedVersion: 2,
            idempotencyKey: "00000000-0000-4000-8000-000000000106",
            revisionId,
            agreementAt: null,
            suppliedByName: null,
            suppliedByContactId: null,
            channel: "email",
            externalReference: null,
        };
        expect(
            (await quoteMutation(mutation({ intent: "accept", quoteId: quote.id, payload })))
                .status,
        ).toBe(200);
        expect(mutateQuote).toHaveBeenCalledWith(
            "verified-token",
            "verified-tenant",
            `/quotations/${quote.id}/acceptances`,
            "POST",
            payload,
        );
        await quoteLookup(
            new NextRequest(
                `http://localhost:3000/auth/quotations?id=${quote.id}&organizationId=untrusted`,
            ),
        );
        expect(getQuote).toHaveBeenCalledWith("verified-token", "verified-tenant", quote.id);
    });
});
