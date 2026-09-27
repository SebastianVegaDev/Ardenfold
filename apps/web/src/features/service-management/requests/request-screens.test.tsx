import type { ActiveOrganizationResponse, ServiceRequestDetail } from "@ardenfold/contracts";
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveOrganization } from "@/auth/api-client";
import messages from "@/i18n/messages/en.json";

import { getServiceRequest, listServiceRequests, ServiceRequestApiError } from "./api/request-api";
import { RequestDetailScreen } from "./details/request-detail-screen";
import { RequestsListScreen } from "./list/requests-list-screen";
import { RequestLoading } from "./request-loading";
import type * as RequestApi from "./api/request-api";

vi.mock("next-intl/server", () => ({
    getTranslations: (namespace: "operations" | "serviceRequests") =>
        Promise.resolve(createTranslator({ locale: "en", messages, namespace })),
}));
vi.mock("@/auth/server-organization", () => ({
    getActiveOrganizationSession: () =>
        Promise.resolve({
            session: { accessToken: "token" },
            organization: { id: "tenant" },
        }),
}));
vi.mock("@/auth/api-client", () => ({ getActiveOrganization: vi.fn() }));
vi.mock("./api/request-api", async (importOriginal) => ({
    ...(await importOriginal<typeof RequestApi>()),
    listServiceRequests: vi.fn(),
    getServiceRequest: vi.fn(),
}));

const active: ActiveOrganizationResponse = {
    id: "tenant",
    name: "Operations",
    defaultLocale: "en",
    defaultTimeZone: "America/Lima",
    role: "viewer",
    permissions: ["service_requests.read"],
};

beforeEach(() => {
    vi.mocked(getActiveOrganization).mockResolvedValue(active);
    vi.mocked(listServiceRequests).mockResolvedValue({ data: [], nextCursor: null });
});

describe("Request screens", () => {
    it("shows an empty list and hides creation for a reader", async () => {
        render(await RequestsListScreen({ locale: "en", query: {} }));
        expect(screen.getByRole("status")).toHaveTextContent(
            "No service requests have been recorded yet",
        );
        expect(screen.queryByRole("link", { name: "New service request" })).not.toBeInTheDocument();
    });

    it("stops before querying requests when permission is missing", async () => {
        vi.mocked(getActiveOrganization).mockResolvedValue({ ...active, permissions: [] });
        render(await RequestsListScreen({ locale: "en", query: {} }));
        expect(screen.getByRole("alert")).toHaveTextContent("You do not have permission");
        expect(listServiceRequests).not.toHaveBeenCalled();
    });

    it("surfaces API failure safely", async () => {
        vi.mocked(listServiceRequests).mockRejectedValue(
            new ServiceRequestApiError(503, "INTERNAL_ERROR"),
        );
        render(await RequestsListScreen({ locale: "en", query: {} }));
        expect(screen.getByRole("alert")).toHaveTextContent("Service requests could not be loaded");
        expect(screen.queryByText("INTERNAL_ERROR")).not.toBeInTheDocument();
    });

    it("keeps terminal requests read-only for a writer and formats dates in the organization time zone", async () => {
        vi.mocked(getActiveOrganization).mockResolvedValue({
            ...active,
            permissions: ["service_requests.read", "service_requests.write"],
        });
        const detail: ServiceRequestDetail = {
            id: "00000000-0000-4000-8000-000000000002",
            customerPartyId: "customer",
            requesterContactId: null,
            requesterName: "Caller",
            siteId: null,
            summary: "Closed customer need",
            status: "closed",
            version: 2,
            createdAt: "2026-01-02T02:00:00.000Z",
            updatedAt: "2026-01-02T03:00:00.000Z",
            terminalAt: "2026-01-02T03:00:00.000Z",
            customerContext: null,
            terminalReason: "Need resolved",
            scopeItems: [],
        };
        vi.mocked(getServiceRequest).mockResolvedValue(detail);
        render(await RequestDetailScreen({ locale: "en", requestId: detail.id }));
        expect(screen.getByRole("heading", { name: "Closed customer need" })).toBeInTheDocument();
        expect(
            screen.queryByRole("link", { name: "Edit service request" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Close request" })).not.toBeInTheDocument();
        expect(screen.getByText(/Jan 1, 2026.*9:00 PM/u)).toBeInTheDocument();
    });

    it("announces the loading state", async () => {
        render(await RequestLoading());
        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
        expect(screen.getByRole("status")).toHaveTextContent("Loading service requests");
    });
});
