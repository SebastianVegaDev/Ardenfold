import type { PartyDetail, ServiceRequestDetail } from "@ardenfold/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

import {
    fetchCurrentRequest,
    RequestWebError,
    searchCustomers,
    submitRequest,
} from "../api/browser-client";
import { RequestEditor } from "./request-editor";
import type * as BrowserClient from "../api/browser-client";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("../api/browser-client", async (importOriginal) => ({
    ...(await importOriginal<typeof BrowserClient>()),
    submitRequest: vi.fn(),
    fetchCurrentRequest: vi.fn(),
    searchCustomers: vi.fn(),
}));

const customer: PartyDetail = {
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Industrial Customer",
    legalName: null,
    kind: "organization",
    roles: ["customer"],
    status: "active",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    identifiers: [],
    contacts: [],
    addresses: [],
    duplicateCandidates: [],
};
const request: ServiceRequestDetail = {
    id: "00000000-0000-4000-8000-000000000002",
    customerPartyId: customer.id,
    requesterContactId: null,
    requesterName: "Caller",
    siteId: null,
    summary: "Inspect motor",
    customerContext: "No serial available",
    status: "active",
    version: 1,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    terminalAt: null,
    terminalReason: null,
    scopeItems: [],
};

function editor(initial?: ServiceRequestDetail, locale: "en" | "es" = "en") {
    return render(
        <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : es}>
            <RequestEditor
                locale={locale}
                {...(initial ? { initial } : {})}
                initialCustomer={customer}
                canReadAssets={false}
            />
        </NextIntlClientProvider>,
    );
}

beforeEach(() => {
    vi.mocked(submitRequest).mockReset();
    vi.mocked(fetchCurrentRequest).mockReset();
    vi.mocked(searchCustomers).mockReset();
});

describe("RequestEditor", () => {
    it("saves unresolved scope through the contract without inventing an asset or sending a tenant", async () => {
        vi.mocked(submitRequest).mockResolvedValue(request);
        editor();
        fireEvent.change(screen.getByLabelText("Short summary"), {
            target: { value: "Inspect motor" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Add scope item" }));
        fireEvent.change(screen.getByLabelText("Requested work or need"), {
            target: { value: "Inspect unknown motor" },
        });
        fireEvent.change(screen.getByLabelText("Unidentified asset details"), {
            target: { value: "No serial available" },
        });
        expect(screen.queryByLabelText("Search registered assets")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Create request" }));
        await waitFor(() =>
            expect(submitRequest).toHaveBeenCalledWith({
                intent: "create",
                payload: {
                    customerPartyId: customer.id,
                    requesterContactId: null,
                    requesterName: null,
                    summary: "Inspect motor",
                    customerContext: null,
                    scopeItems: [
                        {
                            description: "Inspect unknown motor",
                            assetId: null,
                            unidentifiedAssetDescription: "No serial available",
                        },
                    ],
                },
            }),
        );
        expect(navigation.push).toHaveBeenCalledWith(
            `/en/app/service-requests/${request.id}?notice=success`,
        );
    });

    it("preserves the draft on conflict and requires explicit review before retrying against the current version", async () => {
        vi.mocked(submitRequest)
            .mockRejectedValueOnce(new RequestWebError(409, "VERSION_CONFLICT"))
            .mockResolvedValue(request);
        vi.mocked(fetchCurrentRequest).mockResolvedValue({
            ...request,
            version: 2,
            summary: "Another user changed the scope",
        });
        editor(request);
        fireEvent.change(screen.getByLabelText("Short summary"), {
            target: { value: "My clarification" },
        });
        fireEvent.change(screen.getByLabelText("Reason for change"), {
            target: { value: "Customer clarified" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await screen.findByText("Another user changed the scope");
        expect(screen.getByLabelText("Short summary")).toHaveValue("My clarification");
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
        expect(submitRequest).toHaveBeenCalledTimes(1);
        fireEvent.click(
            screen.getByRole("button", { name: "I reviewed the changes; keep my draft" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(submitRequest).toHaveBeenCalledTimes(2));
        expect(vi.mocked(submitRequest).mock.calls[1]![0]).toMatchObject({
            payload: { expectedVersion: 2, summary: "My clarification" },
        });
    });

    it("does not offer a retry when the current request became terminal", async () => {
        vi.mocked(submitRequest).mockRejectedValue(new RequestWebError(409, "VERSION_CONFLICT"));
        vi.mocked(fetchCurrentRequest).mockResolvedValue({
            ...request,
            version: 2,
            status: "closed",
            terminalAt: request.updatedAt,
            terminalReason: "Finished",
        });
        editor(request);
        fireEvent.change(screen.getByLabelText("Reason for change"), {
            target: { value: "Clarification" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        expect(
            await screen.findByRole("button", { name: "I reviewed the changes; keep my draft" }),
        ).toBeDisabled();
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });

    it("omits unchanged archived customer references when correcting request content", async () => {
        vi.mocked(submitRequest).mockResolvedValue(request);
        render(
            <NextIntlClientProvider locale="en" messages={en}>
                <RequestEditor
                    locale="en"
                    initial={request}
                    initialCustomer={{ ...customer, status: "archived" }}
                    canReadAssets={false}
                />
            </NextIntlClientProvider>,
        );
        fireEvent.change(screen.getByLabelText("Short summary"), {
            target: { value: "Correction" },
        });
        fireEvent.change(screen.getByLabelText("Reason for change"), {
            target: { value: "Correction" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(submitRequest).toHaveBeenCalled());
        const payload = (
            vi.mocked(submitRequest).mock.calls[0]![0] as { payload: Record<string, unknown> }
        ).payload;
        expect(payload.customerPartyId).toBeUndefined();
        expect(payload.requesterContactId).toBeUndefined();
    });

    it("announces empty lookup results and failures while preserving entered data", async () => {
        vi.mocked(searchCustomers)
            .mockResolvedValueOnce({ data: [], nextCursor: null })
            .mockRejectedValueOnce(new Error("Offline"));
        editor();
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        await screen.findByText("No matches found. Try a different search.");
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "The search could not be completed",
        );
    });

    it("renders Spanish labels and prevents saving without a customer", async () => {
        render(
            <NextIntlClientProvider locale="es" messages={es}>
                <RequestEditor locale="es" canReadAssets={false} />
            </NextIntlClientProvider>,
        );
        fireEvent.change(screen.getByLabelText("Resumen breve"), {
            target: { value: "Inspección" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Crear solicitud" }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Selecciona un cliente antes de guardar",
        );
        expect(submitRequest).not.toHaveBeenCalled();
    });
});
