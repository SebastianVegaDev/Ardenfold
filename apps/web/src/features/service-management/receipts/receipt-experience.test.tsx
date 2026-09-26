import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAssetRelationships } from "@/features/service-management/work-orders/api/browser-client";
import {
    assetId,
    receipt,
    relationships,
    workOrder,
} from "@/features/service-management/work-orders/test/fixtures";
import en from "@/i18n/messages/en.json";

import { submitReceipt } from "./api/browser-client";
import { ReceiptCorrectionForm } from "./details/receipt-correction-form";
import { ReceiptList } from "./details/receipt-list";
import { ReceiptIntake } from "./intake/receipt-intake";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/features/service-management/work-orders/api/browser-client", () => ({
    fetchAssetRelationships: vi.fn(),
    searchWorkAssets: vi.fn(),
}));
vi.mock("./api/browser-client", () => ({
    submitReceipt: vi.fn(),
    fetchCurrentReceipt: vi.fn(),
    ReceiptWebError: class extends Error {},
}));

const assets = { [assetId]: { name: "Pump", current: relationships } };
const renderLocalized = (element: React.ReactNode) =>
    render(
        <NextIntlClientProvider locale="en" messages={en}>
            {element}
        </NextIntlClientProvider>,
    );

beforeEach(() => {
    vi.mocked(submitReceipt).mockReset();
    vi.mocked(fetchAssetRelationships).mockReset();
    navigation.refresh.mockReset();
});

describe("receipt operational experience", () => {
    it("captures intake condition and accessories, then refreshes authoritative Registry state", async () => {
        vi.mocked(submitReceipt).mockResolvedValue(receipt);
        vi.mocked(fetchAssetRelationships).mockResolvedValue(relationships);
        renderLocalized(
            <ReceiptIntake
                locale="en"
                order={workOrder}
                assets={assets}
                siteName="Main shop"
                canCoordinate
            />,
        );
        fireEvent.click(screen.getByRole("checkbox", { name: /Item 1/ }));
        fireEvent.change(screen.getByLabelText("Intake context"), {
            target: { value: "Received at desk" },
        });
        fireEvent.change(screen.getByLabelText("Observed condition"), {
            target: { value: "Case scratched" },
        });
        fireEvent.change(screen.getByLabelText("Person receiving the item"), {
            target: { value: "Technician" },
        });
        fireEvent.change(screen.getByLabelText("Received at"), {
            target: { value: "2026-01-02T00:00" },
        });
        fireEvent.change(screen.getByLabelText("Accessories and components"), {
            target: { value: "Cable\nCase" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Record physical intake" }));
        await waitFor(() => expect(submitReceipt).toHaveBeenCalledOnce());
        const value = vi.mocked(submitReceipt).mock.calls[0]![0] as {
            payload: {
                observedCondition: string;
                accessories: string[];
                assetId: string;
                expectedAssetVersion: number;
                coordination: { custody: unknown; location: unknown };
            };
        };
        expect(value.payload.observedCondition).toBe("Case scratched");
        expect(value.payload.accessories).toEqual(["Cable", "Case"]);
        expect(value.payload.assetId).toBe(assetId);
        expect(value.payload.expectedAssetVersion).toBe(1);
        expect(value.payload.coordination.custody).toEqual({ subject: "recording_organization" });
        expect(value.payload.coordination.location).toEqual({
            subject: "site",
            siteId: workOrder.siteId,
            locationDescription: "Main shop",
        });
        await waitFor(() => expect(fetchAssetRelationships).toHaveBeenCalledWith(assetId));
        expect(navigation.refresh).toHaveBeenCalled();
    });

    it("keeps no-intake work outside the receipt form", () => {
        const onSite = {
            ...workOrder,
            items: [{ ...workOrder.items[0]!, serviceMode: "no_intake" as const }],
        };
        const view = renderLocalized(
            <ReceiptIntake
                locale="en"
                order={onSite}
                assets={assets}
                siteName="Main shop"
                canCoordinate
            />,
        );
        expect(view.container).toBeEmptyDOMElement();
    });

    it("displays current Registry relationships separately from receipt facts", () => {
        const current = {
            ...relationships,
            custody: {
                id: "00000000-0000-4000-8000-000000000210",
                kind: "custody" as const,
                subject: "recording_organization" as const,
                partyId: null,
                siteId: null,
                partyAddressId: null,
                locationDescription: null,
                effectiveFrom: receipt.receivedAt,
                effectiveTo: null,
                supersedesId: null,
                supersededAt: null,
                revisionReason: null,
                aggregateVersion: 2,
                recordedByUserId: "00000000-0000-4000-8000-000000000211",
                recordedAt: receipt.recordedAt,
            },
        };
        renderLocalized(
            <ReceiptList
                locale="en"
                order={workOrder}
                receipts={[receipt]}
                assets={{ [assetId]: { name: "Pump", current } }}
            />,
        );
        expect(screen.getByText(/Case scratched/)).toBeInTheDocument();
        expect(screen.getByText("Current Asset Registry relationships")).toBeInTheDocument();
        expect(screen.getByText("Custody: Recording organization")).toBeInTheDocument();
    });

    it("corrects intake facts with explicit versions and preserves a recovery path", async () => {
        vi.mocked(submitReceipt).mockResolvedValue({ ...receipt, version: 2 });
        vi.mocked(fetchAssetRelationships).mockResolvedValue(relationships);
        renderLocalized(
            <ReceiptCorrectionForm
                receipt={receipt}
                order={workOrder}
                current={relationships}
                canCoordinate
            />,
        );
        fireEvent.change(screen.getByLabelText("Reason for correction"), {
            target: { value: "New inspection" },
        });
        fireEvent.change(screen.getByLabelText("Observed condition"), {
            target: { value: "Clean" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
        await waitFor(() => expect(submitReceipt).toHaveBeenCalledOnce());
        const value = vi.mocked(submitReceipt).mock.calls[0]![0] as {
            payload: {
                expectedVersion: number;
                expectedOrderVersion: number;
                observedCondition: string;
                reason: string;
            };
        };
        expect(value.payload).toMatchObject({
            expectedVersion: 1,
            expectedOrderVersion: 1,
            observedCondition: "Clean",
            reason: "New inspection",
        });
        await waitFor(() => expect(fetchAssetRelationships).toHaveBeenCalledWith(assetId));
    });
});
