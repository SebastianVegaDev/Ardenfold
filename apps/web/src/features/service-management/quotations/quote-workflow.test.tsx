import { acceptQuoteRevisionSchema, type QuoteDetail } from "@ardenfold/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import en from "@/i18n/messages/en.json";

import { QuoteActions } from "./acceptance/quote-actions";
import { fetchCurrentQuote, QuoteWebError, submitQuote } from "./api/browser-client";
import { RevisionHistory } from "./revisions/revision-history";
import { quote, revisionId, time } from "./test/fixtures";
import type * as BrowserClient from "./api/browser-client";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("./api/browser-client", async (importOriginal) => ({
    ...(await importOriginal<typeof BrowserClient>()),
    submitQuote: vi.fn(),
    fetchCurrentQuote: vi.fn(),
}));

const offered: QuoteDetail = {
    ...quote,
    revisions: [
        {
            ...quote.revisions[0]!,
            status: "offered",
            subtotal: "125.00",
            total: "125.00",
            issuedAt: time,
            issueChannel: "email",
            lines: [
                {
                    ...quote.revisions[0]!.lines[0]!,
                    roundedBaseAmount: "125.00",
                    totalAmount: "125.00",
                },
            ],
        },
    ],
};

function renderActions(value: QuoteDetail, canRevise = true, canDecide = true, canAccept = true) {
    return render(
        <NextIntlClientProvider locale="en" messages={en}>
            <QuoteActions
                quote={value}
                locale="en"
                canRevise={canRevise}
                canDecide={canDecide}
                canAccept={canAccept}
            />
        </NextIntlClientProvider>,
    );
}

beforeEach(() => {
    vi.mocked(submitQuote).mockReset();
    vi.mocked(fetchCurrentQuote).mockReset();
    navigation.refresh.mockReset();
});

describe("quotation revision and decision experience", () => {
    it("shows immutable accepted history and expired/rejected states with exact totals", () => {
        const accepted: QuoteDetail = {
            ...offered,
            status: "accepted",
            activeAcceptanceId: "00000000-0000-4000-8000-000000000101",
            revisions: [
                { ...offered.revisions[0]!, status: "accepted" },
                {
                    ...offered.revisions[0]!,
                    id: "00000000-0000-4000-8000-000000000102",
                    revisionNumber: 2,
                    status: "rejected",
                },
                {
                    ...offered.revisions[0]!,
                    id: "00000000-0000-4000-8000-000000000103",
                    revisionNumber: 3,
                    status: "expired",
                },
            ],
            acceptances: [
                {
                    id: "00000000-0000-4000-8000-000000000101",
                    quoteId: quote.id,
                    revisionId,
                    agreementAt: null,
                    recordedAt: time,
                    recordedByUserId: "00000000-0000-4000-8000-000000000104",
                    suppliedByName: "Customer",
                    suppliedByContactId: null,
                    channel: "email",
                    externalReference: null,
                    withdrawnAt: null,
                    withdrawalReason: null,
                },
            ],
        };
        render(
            <NextIntlClientProvider locale="en" messages={en}>
                <RevisionHistory quote={accepted} locale="en" timeZone="America/Lima" />
            </NextIntlClientProvider>,
        );
        expect(screen.getByRole("status")).toHaveTextContent("Active agreement: revision 1");
        expect(screen.getByText("Rejected")).toBeInTheDocument();
        expect(screen.getByText("Expired")).toBeInTheDocument();
        expect(screen.getAllByText(/PEN|S\//u).length).toBeGreaterThan(0);
        expect(screen.queryByRole("link", { name: "Edit draft" })).not.toBeInTheDocument();
    });

    it("hides actions for readers and acceptance when the required party permission is absent", () => {
        const view = renderActions(offered, false, false, false);
        expect(
            screen.queryByRole("button", { name: /acceptance of revision/u }),
        ).not.toBeInTheDocument();
        view.rerender(
            <NextIntlClientProvider locale="en" messages={en}>
                <QuoteActions
                    quote={offered}
                    locale="en"
                    canRevise={false}
                    canDecide={true}
                    canAccept={false}
                />
            </NextIntlClientProvider>,
        );
        expect(
            screen.getByRole("button", { name: "Record rejection of revision 1" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Record acceptance of revision 1" }),
        ).not.toBeInTheDocument();
    });

    it("records acceptance against the exact offered revision and a stable idempotency key", async () => {
        vi.mocked(submitQuote).mockResolvedValue(null);
        vi.mocked(fetchCurrentQuote).mockResolvedValue({ ...offered, status: "accepted" });
        renderActions(offered);
        fireEvent.change(screen.getByLabelText("Communication channel"), {
            target: { value: "email" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Record acceptance of revision 1" }));
        await waitFor(() => expect(submitQuote).toHaveBeenCalledTimes(1));
        const sent = z
            .strictObject({
                intent: z.literal("accept"),
                quoteId: z.string(),
                payload: acceptQuoteRevisionSchema,
            })
            .parse(vi.mocked(submitQuote).mock.calls[0]?.[0]);
        expect(sent.quoteId).toBe(quote.id);
        expect(sent.payload.revisionId).toBe(revisionId);
        expect(sent.payload.expectedVersion).toBe(2);
        expect(sent.payload.channel).toBe("email");
        expect(sent.payload.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    });

    it("copies a delivered revision without offering historical editing", async () => {
        vi.mocked(submitQuote).mockResolvedValue({
            ...offered,
            version: 3,
            revisions: [
                ...offered.revisions,
                {
                    ...quote.revisions[0]!,
                    id: "00000000-0000-4000-8000-000000000105",
                    revisionNumber: 2,
                    sourceRevisionId: revisionId,
                },
            ],
        });
        renderActions(offered);
        expect(screen.queryByRole("link", { name: "Edit draft" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Create new revision from this one" }));
        await waitFor(() =>
            expect(submitQuote).toHaveBeenCalledWith({
                intent: "copy",
                quoteId: quote.id,
                payload: { expectedVersion: 2, sourceRevisionId: revisionId },
            }),
        );
    });

    it("stops stale decisions and offers a recoverable current-state review", async () => {
        vi.mocked(submitQuote).mockRejectedValue(new QuoteWebError(409, "VERSION_CONFLICT"));
        vi.mocked(fetchCurrentQuote).mockResolvedValue({
            ...offered,
            version: 3,
            status: "closed",
        });
        renderActions(offered);
        fireEvent.change(screen.getByLabelText("Communication channel"), {
            target: { value: "email" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Record acceptance of revision 1" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("This quotation changed");
        expect(
            screen.getByRole("button", { name: "Record acceptance of revision 1" }),
        ).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Load latest state" }));
        expect(
            screen.queryByRole("button", { name: "Record acceptance of revision 1" }),
        ).not.toBeInTheDocument();
    });
});
