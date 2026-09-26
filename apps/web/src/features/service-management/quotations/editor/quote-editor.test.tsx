import { createQuoteSchema, editQuoteDraftSchema } from "@ardenfold/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

import { fetchCurrentQuote, QuoteWebError, submitQuote } from "../api/browser-client";
import { quote, request, revisionId } from "../test/fixtures";
import { QuoteEditor } from "./quote-editor";
import type * as BrowserClient from "../api/browser-client";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("../api/browser-client", async (importOriginal) => ({
    ...(await importOriginal<typeof BrowserClient>()),
    submitQuote: vi.fn(),
    fetchCurrentQuote: vi.fn(),
}));

function editor(mode: "create" | "edit", locale: "en" | "es" = "en") {
    return render(
        <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : es}>
            {mode === "create" ? (
                <QuoteEditor locale={locale} request={request} />
            ) : (
                <QuoteEditor locale={locale} quote={quote} revisionId={revisionId} />
            )}
        </NextIntlClientProvider>,
    );
}

beforeEach(() => {
    vi.mocked(submitQuote).mockReset();
    vi.mocked(fetchCurrentQuote).mockReset();
    navigation.push.mockReset();
    navigation.refresh.mockReset();
});

describe("quotation editor", () => {
    it("creates a draft from eligible request scope through the shared contract", async () => {
        vi.mocked(submitQuote).mockResolvedValue(quote);
        editor("create");
        expect(screen.getByLabelText("Description")).toHaveValue("Inspect motor bearings");
        fireEvent.change(screen.getByLabelText("Quotation reference"), {
            target: { value: "Q-2026-001" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Create quotation" }));
        await waitFor(() => expect(submitQuote).toHaveBeenCalledTimes(1));
        const sent = z
            .strictObject({ intent: z.literal("create"), payload: createQuoteSchema })
            .parse(vi.mocked(submitQuote).mock.calls[0]?.[0]);
        expect(sent.payload.requestId).toBe(request.id);
        expect(sent.payload.reference).toBe("Q-2026-001");
        expect(sent.payload.draft.lines[0]).toMatchObject({
            description: "Inspect motor bearings",
            quantity: "1",
            unitPrice: "0",
        });
        expect(navigation.push).toHaveBeenCalledWith(
            `/en/app/quotations/${quote.id}?notice=success`,
        );
    });

    it("edits only the draft and sends the expected quote version", async () => {
        vi.mocked(submitQuote).mockResolvedValue(quote);
        editor("edit");
        fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "125.125" } });
        fireEvent.change(screen.getByLabelText("Reason for draft change"), {
            target: { value: "Updated estimate" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
        await waitFor(() => expect(submitQuote).toHaveBeenCalledTimes(1));
        const sent = z
            .strictObject({
                intent: z.literal("edit"),
                quoteId: z.string(),
                revisionId: z.string(),
                payload: editQuoteDraftSchema,
            })
            .parse(vi.mocked(submitQuote).mock.calls[0]?.[0]);
        expect(sent.quoteId).toBe(quote.id);
        expect(sent.revisionId).toBe(revisionId);
        expect(sent.payload.expectedVersion).toBe(2);
        expect(sent.payload.reason).toBe("Updated estimate");
        expect(sent.payload.draft.lines[0]?.unitPrice).toBe("125.125");
    });

    it("preserves a conflicting draft and requires review before retry", async () => {
        vi.mocked(submitQuote).mockRejectedValue(new QuoteWebError(409, "VERSION_CONFLICT"));
        vi.mocked(fetchCurrentQuote).mockResolvedValue({ ...quote, version: 3 });
        editor("edit");
        fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "175.00" } });
        fireEvent.change(screen.getByLabelText("Reason for draft change"), {
            target: { value: "Updated estimate" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
        await screen.findByRole("alert");
        expect(screen.getByLabelText("Unit price")).toHaveValue("175.00");
        expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
        expect(
            screen.getByRole("link", { name: "Review latest quotation in a new tab" }),
        ).toHaveAttribute("target", "_blank");
        fireEvent.click(
            screen.getByRole("button", { name: "I reviewed the changes; keep my draft" }),
        );
        expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    });
});
