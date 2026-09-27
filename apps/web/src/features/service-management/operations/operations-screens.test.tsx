import type {
    ActiveOrganizationResponse,
    OperationalQueueResponse,
    RequestTimelineResponse,
} from "@ardenfold/contracts";
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveOrganization } from "@/auth/api-client";
import messages from "@/i18n/messages/en.json";

import { getRequestTimeline, listOperationalQueue } from "./api/operations-api";
import { OperationalQueuesScreen } from "./queues/operational-queues-screen";
import { RequestTimelineScreen } from "./timeline/request-timeline-screen";

vi.mock("next-intl/server", () => ({
    getTranslations: () =>
        Promise.resolve(createTranslator({ locale: "en", messages: messages.operations })),
}));
vi.mock("@/auth/server-organization", () => ({
    getActiveOrganizationSession: () =>
        Promise.resolve({ session: { accessToken: "token" }, organization: { id: "tenant" } }),
}));
vi.mock("@/auth/api-client", () => ({ getActiveOrganization: vi.fn() }));
vi.mock("./api/operations-api", () => ({
    listOperationalQueue: vi.fn(),
    getRequestTimeline: vi.fn(),
    OperationalViewApiError: class extends Error {},
}));

const requestId = "00000000-0000-4000-8000-000000000001";
const partyId = "00000000-0000-4000-8000-000000000002";
const orderId = "00000000-0000-4000-8000-000000000003";
const assetId = "00000000-0000-4000-8000-000000000004";
const permissions: ActiveOrganizationResponse["permissions"] = [
    "service_requests.read",
    "quotations.read",
    "work_orders.read",
    "receipts.read",
    "parties.read",
    "assets.read",
];
const active: ActiveOrganizationResponse = {
    id: "tenant",
    name: "Operations",
    defaultLocale: "en",
    defaultTimeZone: "UTC",
    role: "viewer",
    permissions,
};
const queue: OperationalQueueResponse = {
    data: [
        {
            subjectId: orderId,
            subjectType: "work_order",
            requestId,
            quoteId: null,
            revisionId: null,
            acceptanceId: null,
            workOrderId: orderId,
            workItemId: null,
            reference: "WO-12",
            title: "Inspect motor",
            status: "planned",
            occurredAt: "2026-01-02T02:00:00.000Z",
            customer: { id: partyId, currentName: "Acme Industrial", currentStatus: "active" },
            siteId: null,
            asset: { id: assetId, currentName: "Motor A", currentStatus: "active" },
            receiptStatus: "pending",
        },
    ],
    nextCursor: "next-page",
};
const timeline: RequestTimelineResponse = {
    request: { id: requestId, summary: "Inspect motor", status: "active" },
    currentCustomer: { id: partyId, name: "Acme Industrial", status: "active" },
    currentAssets: [{ id: assetId, name: "Motor A", status: "active" }],
    data: [
        {
            key: "receipt:one",
            source: "receipt",
            kind: "corrected",
            occurredAt: "2026-01-02T02:00:00.000Z",
            actorUserId: partyId,
            requestId,
            quoteId: null,
            revisionId: null,
            acceptanceId: null,
            workOrderId: orderId,
            workItemId: null,
            receiptId: orderId,
            assetId,
            reason: "Corrected historical intake",
            historicalDetails: { customerName: "Former customer" },
        },
    ],
    nextCursor: "older-page",
};

beforeEach(() => {
    vi.mocked(getActiveOrganization).mockResolvedValue(active);
    vi.mocked(listOperationalQueue).mockResolvedValue(queue);
    vi.mocked(getRequestTimeline).mockResolvedValue(timeline);
});

describe("operational read screens", () => {
    it("requires the combined read permissions before querying", async () => {
        vi.mocked(getActiveOrganization).mockResolvedValue({
            ...active,
            permissions: ["work_orders.read"],
        });
        render(await OperationalQueuesScreen({ locale: "en", query: {} }));
        render(await RequestTimelineScreen({ locale: "en", requestId }));
        expect(screen.getAllByRole("alert")).toHaveLength(2);
        expect(listOperationalQueue).not.toHaveBeenCalled();
        expect(getRequestTimeline).not.toHaveBeenCalled();
    });

    it("shows a navigable queue with live context and a bounded next page", async () => {
        render(await OperationalQueuesScreen({ locale: "en", query: { kind: "active_work" } }));
        expect(screen.getByRole("link", { name: "WO-12" })).toHaveAttribute(
            "href",
            `/en/app/work-orders/${orderId}`,
        );
        expect(screen.getByText("Acme Industrial")).toBeInTheDocument();
        expect(screen.getByText("Motor A")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
            "href",
            "/en/app/operations?kind=active_work&cursor=next-page",
        );
    });

    it("keeps current context separate from historical events", async () => {
        render(await RequestTimelineScreen({ locale: "en", requestId }));
        expect(screen.getByText(/Acme Industrial/u)).toBeInTheDocument();
        expect(screen.getByText(/Motor A/u)).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Receipt corrected" })).toBeInTheDocument();
        expect(screen.getByText(/Corrected historical intake/u)).toBeInTheDocument();
        expect(screen.queryByText("Former customer")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View work order" })).toHaveAttribute(
            "href",
            `/en/app/work-orders/${orderId}`,
        );
        expect(screen.getByRole("link", { name: "Older events" })).toHaveAttribute(
            "href",
            `/en/app/service-requests/${requestId}/timeline?cursor=older-page`,
        );
    });
});
