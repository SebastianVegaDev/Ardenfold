import type { ActiveOrganizationResponse } from "@ardenfold/contracts";
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveOrganization } from "@/auth/api-client";
import { getServiceRequest } from "@/features/service-management/requests/api/request-api";
import messages from "@/i18n/messages/en.json";

import { getQuote, listQuotes, QuoteApiError } from "./api/quote-api";
import { QuoteCreateScreen } from "./create/quote-create-screen";
import { QuoteDetailScreen } from "./details/quote-detail-screen";
import { QuotesListScreen } from "./list/quotes-list-screen";
import { QuoteLoading } from "./quote-loading";
import { quote, request, revisionId } from "./test/fixtures";
import type * as QuoteApi from "./api/quote-api";

vi.mock("next-intl/server", () => ({
    getTranslations: (namespace: "operations" | "quotations") =>
        Promise.resolve(createTranslator({ locale: "en", messages, namespace })),
}));
vi.mock("@/auth/server-organization", () => ({
    getActiveOrganizationSession: () =>
        Promise.resolve({ session: { accessToken: "token" }, organization: { id: "tenant" } }),
}));
vi.mock("@/auth/api-client", () => ({ getActiveOrganization: vi.fn() }));
vi.mock("@/features/service-management/requests/api/request-api", () => ({
    getServiceRequest: vi.fn(),
    ServiceRequestApiError: class extends Error {},
}));
vi.mock("./api/quote-api", async (importOriginal) => ({
    ...(await importOriginal<typeof QuoteApi>()),
    getQuote: vi.fn(),
    listQuotes: vi.fn(),
}));
vi.mock("./editor/quote-editor", () => ({ QuoteEditor: () => <div data-testid="quote-editor" /> }));
vi.mock("./revisions/revision-history", () => ({
    RevisionHistory: () => <div data-testid="revision-history" />,
}));
vi.mock("./acceptance/quote-actions", () => ({
    QuoteActions: () => <div data-testid="quote-actions" />,
}));

const active: ActiveOrganizationResponse = {
    id: "tenant",
    name: "Operations",
    defaultLocale: "en",
    defaultTimeZone: "America/Lima",
    role: "viewer",
    permissions: ["quotations.read"],
};

beforeEach(() => {
    vi.mocked(getActiveOrganization).mockResolvedValue(active);
    vi.mocked(getServiceRequest).mockResolvedValue(request);
    vi.mocked(getQuote).mockResolvedValue(quote);
    vi.mocked(listQuotes).mockResolvedValue({ data: [], nextCursor: null });
});

describe("quotation server screens", () => {
    it("shows an empty list and hides creation for a reader", async () => {
        render(await QuotesListScreen({ locale: "en", query: {} }));
        expect(screen.getByText("No quotations have been recorded yet.")).toBeInTheDocument();
        expect(
            screen.queryByRole("link", { name: "Create from a service request" }),
        ).not.toBeInTheDocument();
    });

    it("does not query quotations without read permission and safely reports failures", async () => {
        vi.mocked(getActiveOrganization).mockResolvedValue({ ...active, permissions: [] });
        const view = render(await QuotesListScreen({ locale: "en", query: {} }));
        expect(screen.getByRole("alert")).toHaveTextContent("permission");
        expect(listQuotes).not.toHaveBeenCalled();
        view.unmount();
        vi.mocked(getActiveOrganization).mockResolvedValue(active);
        vi.mocked(listQuotes).mockRejectedValue(new QuoteApiError(503, "INTERNAL_ERROR"));
        render(await QuotesListScreen({ locale: "en", query: {} }));
        expect(
            screen.getByText("The quotation could not be loaded. Try again."),
        ).toBeInTheDocument();
        expect(screen.queryByText("INTERNAL_ERROR")).not.toBeInTheDocument();
    });

    it("creates only from an active request with required permissions", async () => {
        vi.mocked(getActiveOrganization).mockResolvedValue({
            ...active,
            permissions: [
                "quotations.write",
                "service_requests.read",
                "parties.read",
                "assets.read",
            ],
        });
        const view = render(await QuoteCreateScreen({ locale: "en", requestId: request.id }));
        expect(screen.getByText("Inspect motor")).toBeInTheDocument();
        expect(screen.getByTestId("quote-editor")).toBeInTheDocument();
        view.unmount();
        vi.mocked(getServiceRequest).mockResolvedValue({ ...request, status: "closed" });
        render(await QuoteCreateScreen({ locale: "en", requestId: request.id }));
        expect(screen.getByRole("alert")).toHaveTextContent("no longer active");
    });

    it("keeps an issued revision read-only even for a writer", async () => {
        vi.mocked(getActiveOrganization).mockResolvedValue({
            ...active,
            permissions: [
                "quotations.read",
                "quotations.write",
                "service_requests.read",
                "parties.read",
                "assets.read",
            ],
        });
        vi.mocked(getQuote).mockResolvedValue({
            ...quote,
            revisions: [{ ...quote.revisions[0]!, status: "offered" }],
        });
        render(
            await QuoteDetailScreen({
                locale: "en",
                quoteId: quote.id,
                editRevisionId: revisionId,
            }),
        );
        expect(screen.getByRole("alert")).toHaveTextContent("locked");
        expect(screen.queryByTestId("quote-editor")).not.toBeInTheDocument();
    });

    it("announces loading to assistive technology", async () => {
        render(await QuoteLoading());
        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
        expect(screen.getByRole("status")).toHaveTextContent("Loading quotations");
    });
});
