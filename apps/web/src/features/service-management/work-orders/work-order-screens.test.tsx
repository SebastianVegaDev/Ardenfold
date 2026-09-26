import type { ActiveOrganizationResponse } from "@ardenfold/contracts";
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveOrganization } from "@/auth/api-client";
import { listAvailableSites } from "@/features/assets/api-client";
import { getQuote } from "@/features/service-management/quotations/api/quote-api";
import { request } from "@/features/service-management/quotations/test/fixtures";
import { getServiceRequest } from "@/features/service-management/requests/api/request-api";
import en from "@/i18n/messages/en.json";

import { getWorkOrder, listWorkOrders } from "./api/work-order-api";
import { WorkOrderCreateScreen } from "./create/work-order-create-screen";
import { WorkOrdersListScreen } from "./list/work-orders-list-screen";
import { acceptedQuote, site, workOrder } from "./test/fixtures";

vi.mock("next-intl/server", () => ({
    getTranslations: () =>
        Promise.resolve(createTranslator({ locale: "en", messages: en.workOrders })),
}));
vi.mock("@/auth/server-organization", () => ({
    getActiveOrganizationSession: () =>
        Promise.resolve({ session: { accessToken: "token" }, organization: { id: "tenant" } }),
}));
vi.mock("@/auth/api-client", () => ({ getActiveOrganization: vi.fn() }));
vi.mock("@/features/assets/api-client", () => ({ listAvailableSites: vi.fn() }));
vi.mock("@/features/service-management/quotations/api/quote-api", () => ({
    getQuote: vi.fn(),
    QuoteApiError: class extends Error {},
}));
vi.mock("@/features/service-management/requests/api/request-api", () => ({
    getServiceRequest: vi.fn(),
}));
vi.mock("./api/work-order-api", () => ({
    getWorkOrder: vi.fn(),
    listWorkOrders: vi.fn(),
    WorkOrderApiError: class extends Error {},
}));
vi.mock("./create/work-order-create-form", () => ({
    WorkOrderCreateForm: () => <div data-testid="order-create-form" />,
}));

const active: ActiveOrganizationResponse = {
    id: "tenant",
    name: "Operations",
    defaultLocale: "en",
    defaultTimeZone: "UTC",
    role: "viewer",
    permissions: ["work_orders.read"],
};

beforeEach(() => {
    vi.mocked(getActiveOrganization).mockResolvedValue(active);
    vi.mocked(getQuote).mockResolvedValue(acceptedQuote);
    vi.mocked(getServiceRequest).mockResolvedValue(request);
    vi.mocked(listAvailableSites).mockResolvedValue({ data: [site] });
    vi.mocked(listWorkOrders).mockResolvedValue({ data: [workOrder], nextCursor: null });
    vi.mocked(getWorkOrder).mockResolvedValue(workOrder);
});

describe("work order server screens", () => {
    it("hides work order data without read permission", async () => {
        vi.mocked(getActiveOrganization).mockResolvedValue({ ...active, permissions: [] });
        render(await WorkOrdersListScreen({ locale: "en", query: {} }));
        expect(screen.getByRole("alert")).toHaveTextContent("cannot access");
        expect(listWorkOrders).not.toHaveBeenCalled();
    });

    it("shows navigable orders and permission-aware creation", async () => {
        render(await WorkOrdersListScreen({ locale: "en", query: {} }));
        expect(screen.getByRole("link", { name: /WO-1/ })).toHaveAttribute(
            "href",
            `/en/app/work-orders/${workOrder.id}`,
        );
        expect(
            screen.queryByRole("link", { name: "Create from an accepted quotation" }),
        ).not.toBeInTheDocument();
        vi.mocked(getActiveOrganization).mockResolvedValue({
            ...active,
            permissions: ["work_orders.read", "work_orders.write", "quotations.read"],
        });
        render(await WorkOrdersListScreen({ locale: "en", query: {} }));
        expect(
            screen.getByRole("link", { name: "Create from an accepted quotation" }),
        ).toBeInTheDocument();
    });

    it("creates only from an eligible accepted revision with required permissions", async () => {
        vi.mocked(getActiveOrganization).mockResolvedValue({
            ...active,
            permissions: [
                "work_orders.read",
                "work_orders.write",
                "quotations.read",
                "service_requests.read",
                "parties.read",
                "sites.read",
                "assets.read",
            ],
        });
        const view = render(
            await WorkOrderCreateScreen({ locale: "en", quoteId: acceptedQuote.id }),
        );
        expect(screen.getByTestId("order-create-form")).toBeInTheDocument();
        view.unmount();
        vi.mocked(getQuote).mockResolvedValue({ ...acceptedQuote, status: "open" });
        render(await WorkOrderCreateScreen({ locale: "en", quoteId: acceptedQuote.id }));
        expect(screen.getByRole("alert")).toHaveTextContent("no longer eligible");
    });
});
