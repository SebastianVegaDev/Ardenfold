import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { request } from "@/features/service-management/quotations/test/fixtures";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

import { fetchCurrentWorkOrder, submitWorkOrder, WorkOrderWebError } from "./api/browser-client";
import { WorkOrderCreateForm } from "./create/work-order-create-form";
import { acceptedQuote, assetId, orderId, site, workOrder } from "./test/fixtures";
import { WorkOrderOperations } from "./work-items/work-order-operations";
import type * as BrowserClient from "./api/browser-client";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("./api/browser-client", async (importOriginal) => ({
    ...(await importOriginal<typeof BrowserClient>()),
    submitWorkOrder: vi.fn(),
    fetchCurrentWorkOrder: vi.fn(),
    searchWorkAssets: vi.fn(),
}));

function renderCreate(locale: "en" | "es" = "en") {
    return render(
        <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : es}>
            <WorkOrderCreateForm
                locale={locale}
                quote={acceptedQuote}
                request={request}
                revision={acceptedQuote.revisions[0]!}
                acceptanceId={acceptedQuote.activeAcceptanceId!}
                sites={[site]}
                canReadAssets
            />
        </NextIntlClientProvider>,
    );
}

beforeEach(() => {
    vi.mocked(submitWorkOrder).mockReset();
    vi.mocked(fetchCurrentWorkOrder).mockReset();
    navigation.push.mockReset();
    navigation.refresh.mockReset();
});

describe("work order operational experience", () => {
    it("allocates one accepted line to repeated asset items without editing the commercial basis", async () => {
        vi.mocked(submitWorkOrder).mockResolvedValue(workOrder);
        renderCreate();
        expect(screen.getByText("Accepted commercial basis")).toBeInTheDocument();
        expect(screen.getAllByText(/Inspect motor bearings/).length).toBeGreaterThan(0);
        fireEvent.change(screen.getByLabelText("Work order reference"), {
            target: { value: "WO-1" },
        });
        fireEvent.change(screen.getByLabelText("Work site"), { target: { value: site.id } });
        fireEvent.click(screen.getByRole("button", { name: "Split work item" }));
        const quantities = screen.getAllByLabelText("Allocated quantity");
        fireEvent.change(quantities[0]!, { target: { value: "1" } });
        fireEvent.change(quantities[1]!, { target: { value: "1" } });
        fireEvent.click(screen.getByRole("button", { name: "Create work order" }));
        await waitFor(() => expect(submitWorkOrder).toHaveBeenCalledOnce());
        const value = vi.mocked(submitWorkOrder).mock.calls[0]![0] as {
            payload: {
                items: Array<{ assetId: string | null; allocatedQuantity: string }>;
                acceptedRevisionId: string;
            };
        };
        expect(value.payload.acceptedRevisionId).toBe(acceptedQuote.revisions[0]!.id);
        expect(value.payload.items).toHaveLength(2);
        expect(value.payload.items.map((item) => [item.assetId, item.allocatedQuantity])).toEqual([
            [assetId, "1"],
            [assetId, "1"],
        ]);
        expect(navigation.push).toHaveBeenCalledWith(`/en/app/work-orders/${orderId}`);
    });

    it("keeps on-site work free of artificial receipt and surfaces stale creation", async () => {
        vi.mocked(submitWorkOrder).mockRejectedValue(
            new WorkOrderWebError(409, "VERSION_CONFLICT"),
        );
        const noAssetQuote = {
            ...acceptedQuote,
            revisions: [
                {
                    ...acceptedQuote.revisions[0]!,
                    lines: [{ ...acceptedQuote.revisions[0]!.lines[0]!, assetId: null }],
                },
            ],
        };
        render(
            <NextIntlClientProvider locale="es" messages={es}>
                <WorkOrderCreateForm
                    locale="es"
                    quote={noAssetQuote}
                    request={request}
                    revision={noAssetQuote.revisions[0]!}
                    acceptanceId={acceptedQuote.activeAcceptanceId!}
                    sites={[site]}
                    canReadAssets
                />
            </NextIntlClientProvider>,
        );
        expect(screen.getByText("Este ítem no requiere activo ni recepción.")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Referencia de la orden"), {
            target: { value: "WO-2" },
        });
        fireEvent.change(screen.getByLabelText("Sede de trabajo"), { target: { value: site.id } });
        fireEvent.click(screen.getByRole("button", { name: "Crear orden de trabajo" }));
        await waitFor(() => expect(submitWorkOrder).toHaveBeenCalledOnce());
        const value = vi.mocked(submitWorkOrder).mock.calls[0]![0] as {
            payload: { items: Array<{ serviceMode: string }> };
        };
        expect(value.payload.items[0]!.serviceMode).toBe("no_intake");
        expect(screen.getByRole("alert")).toHaveTextContent("Vuelva a cargar");
        expect(
            screen.getByRole("button", { name: "Cargar información actual" }),
        ).toBeInTheDocument();
    });

    it("uses server readiness blockers and resolves version conflicts explicitly", async () => {
        vi.mocked(submitWorkOrder).mockRejectedValue(
            new WorkOrderWebError(409, "VERSION_CONFLICT"),
        );
        vi.mocked(fetchCurrentWorkOrder).mockResolvedValue({ ...workOrder, version: 2 });
        render(
            <NextIntlClientProvider locale="en" messages={en}>
                <WorkOrderOperations
                    locale="en"
                    order={workOrder}
                    assets={{ [assetId]: { name: "Pump", current: null } }}
                    sites={[site]}
                    readiness={[
                        { itemId: workOrder.items[0]!.id, blocker: "WORK_ITEM_INTAKE_REQUIRED" },
                    ]}
                    fixedAssets={{ [workOrder.items[0]!.sourceRevisionLineId]: assetId }}
                    canWrite
                    canReadAssets
                />
            </NextIntlClientProvider>,
        );
        const card = screen.getByRole("article", { name: /Item 1/ });
        expect(within(card).getByText("A physical receipt is required.")).toBeInTheDocument();
        expect(within(card).getByRole("button", { name: "Mark item ready" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Reason for change"), {
            target: { value: "Move to alternate site" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save preparation" }));
        await waitFor(() => expect(screen.getByText("Current version: 2")).toBeInTheDocument());
        expect(screen.getByRole("button", { name: "Load latest version" })).toBeInTheDocument();
    });
});
