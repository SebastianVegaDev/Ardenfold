"use client";

import {
    createQuoteSchema,
    editQuoteDraftSchema,
    type CreateQuote,
    type QuoteDetail,
    type ServiceRequestDetail,
} from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { Locale } from "@/i18n/locales";

import { fetchCurrentQuote, QuoteWebError, submitQuote } from "../api/browser-client";

type Draft = CreateQuote["draft"];
type Line = Draft["lines"][number];
type Adjustment = Draft["adjustments"][number];
type Props = Readonly<{
    locale: Locale;
    request?: ServiceRequestDetail;
    quote?: QuoteDetail;
    revisionId?: string;
}>;

const blankLine = (): Line => ({
    description: "",
    quantity: "1",
    unit: "service",
    unitPrice: "0",
    partyId: null,
    assetId: null,
    adjustments: [],
});
const blankAdjustment = (): Adjustment => ({ label: "", amount: "0" });

function initialDraft(
    request?: ServiceRequestDetail,
    quote?: QuoteDetail,
    revisionId?: string,
): Draft {
    const revision = quote?.revisions.find((item) => item.id === revisionId);
    return {
        currencyCode: revision?.currencyCode ?? "PEN",
        paymentTerms: revision?.paymentTerms ?? null,
        deliveryTerms: revision?.deliveryTerms ?? null,
        serviceLocation: revision?.serviceLocation ?? null,
        intakeExpectations: revision?.intakeExpectations ?? null,
        exclusions: revision?.exclusions ?? null,
        validUntil: revision?.validUntil ?? null,
        lines:
            revision?.lines.map((line) => ({
                description: line.description,
                quantity: line.quantity,
                unit: line.unit,
                unitPrice: line.unitPrice,
                partyId: line.partyId,
                assetId: line.assetId,
                adjustments: line.adjustments,
            })) ??
            request?.scopeItems.map((item) => ({
                ...blankLine(),
                description: item.description,
                assetId: item.assetId,
            })) ??
            [],
        adjustments: revision?.adjustments ?? [],
    };
}

function localDateTime(value: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

export function QuoteEditor({ locale, request, quote, revisionId }: Props) {
    const t = useTranslations("quotations");
    const router = useRouter();
    const revision = quote?.revisions.find((item) => item.id === revisionId);
    const [draft, setDraft] = useState<Draft>(() => initialDraft(request, quote, revisionId));
    const [reference, setReference] = useState("");
    const [reason, setReason] = useState("");
    const [validUntilInput, setValidUntilInput] = useState(() => localDateTime(draft.validUntil));
    const [validUntilChanged, setValidUntilChanged] = useState(false);
    const [version, setVersion] = useState(quote?.version ?? 1);
    const [latest, setLatest] = useState<QuoteDetail | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    function setLine(index: number, change: Partial<Line>) {
        setDraft((current) => ({
            ...current,
            lines: current.lines.map((line, i) => (i === index ? { ...line, ...change } : line)),
        }));
    }
    function setAdjustment(index: number, change: Partial<Adjustment>) {
        setDraft((current) => ({
            ...current,
            adjustments: current.adjustments.map((item, i) =>
                i === index ? { ...item, ...change } : item,
            ),
        }));
    }
    function setLineAdjustment(
        lineIndex: number,
        adjustmentIndex: number,
        change: Partial<Adjustment>,
    ) {
        setDraft((current) => ({
            ...current,
            lines: current.lines.map((line, i) =>
                i === lineIndex
                    ? {
                          ...line,
                          adjustments: line.adjustments.map((item, j) =>
                              j === adjustmentIndex ? { ...item, ...change } : item,
                          ),
                      }
                    : line,
            ),
        }));
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || latest) return;
        setError("");
        let validUntil = draft.validUntil;
        if (validUntilChanged) {
            const parsed = validUntilInput ? new Date(validUntilInput) : null;
            if (parsed && Number.isNaN(parsed.getTime())) {
                setError(t("validationError"));
                return;
            }
            validUntil = parsed?.toISOString() ?? null;
        }
        const content = { ...draft, validUntil };
        const parsed = quote
            ? editQuoteDraftSchema.safeParse({
                  expectedVersion: version,
                  reason: reason.trim(),
                  draft: content,
              })
            : createQuoteSchema.safeParse({
                  requestId: request?.id,
                  reference: reference.trim(),
                  draft: content,
              });
        if (!parsed.success) {
            setError(t("validationError"));
            return;
        }
        setBusy(true);
        try {
            const result = await submitQuote(
                quote
                    ? { intent: "edit", quoteId: quote.id, revisionId, payload: parsed.data }
                    : { intent: "create", payload: parsed.data },
            );
            if (!result) throw new Error("Missing quotation");
            router.push(`/${locale}/app/quotations/${result.id}?notice=success`);
            router.refresh();
        } catch (cause) {
            if (cause instanceof QuoteWebError && cause.status === 409 && quote) {
                try {
                    setLatest(await fetchCurrentQuote(quote.id));
                    setError(
                        t(
                            cause.code === "VERSION_CONFLICT"
                                ? "versionConflict"
                                : cause.code === "QUOTE_REVISION_LOCKED"
                                  ? "revisionLocked"
                                  : "actionUnavailable",
                        ),
                    );
                } catch {
                    setError(t("loadError"));
                }
            } else if (cause instanceof QuoteWebError && cause.status === 403)
                setError(t("forbidden"));
            else if (cause instanceof QuoteWebError && cause.code === "QUOTE_REFERENCE_CONFLICT")
                setError(t("referenceConflict"));
            else if (cause instanceof QuoteWebError && cause.code === "SERVICE_REQUEST_TERMINAL")
                setError(t("requestNotEligible"));
            else setError(t("saveError"));
            setBusy(false);
        }
    }

    return (
        <form onSubmit={(event) => void save(event)} className="space-y-6">
            {error ? (
                <p role="alert" className="rounded-control border border-destructive/30 p-3">
                    {error}
                </p>
            ) : null}
            {latest ? (
                <div
                    role="status"
                    className="space-y-3 rounded-card border border-border bg-surface p-4"
                >
                    <p>{t("latestVersion", { version: latest.version })}</p>
                    <p>{t("conflictReviewHint")}</p>
                    <Link
                        className="text-primary underline"
                        target="_blank"
                        href={`/${locale}/app/quotations/${latest.id}`}
                    >
                        {t("reviewLatest")}
                    </Link>
                    {latest.status !== "closed" &&
                    latest.revisions.some(
                        (item) => item.id === revisionId && item.status === "draft",
                    ) ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setVersion(latest.version);
                                setLatest(null);
                                setError("");
                            }}
                        >
                            {t("useLatestVersion")}
                        </Button>
                    ) : (
                        <p>{t("revisionLocked")}</p>
                    )}
                </div>
            ) : null}
            <fieldset disabled={busy || Boolean(latest)} aria-busy={busy} className="space-y-6">
                <legend className="sr-only">{quote ? t("editDraft") : t("newQuote")}</legend>
                {!quote ? (
                    <div>
                        <Label htmlFor="quote-reference">{t("reference")}</Label>
                        <Input
                            id="quote-reference"
                            required
                            maxLength={80}
                            value={reference}
                            onChange={(event) => setReference(event.target.value)}
                        />
                    </div>
                ) : null}
                <section
                    className="space-y-4 rounded-card border border-border bg-surface p-5"
                    aria-labelledby="quote-terms-heading"
                >
                    <h2 id="quote-terms-heading" className="font-display text-xl font-semibold">
                        {t("terms")}
                    </h2>
                    <div>
                        <Label htmlFor="quote-currency">{t("currency")}</Label>
                        <select
                            id="quote-currency"
                            className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                            value={draft.currencyCode}
                            onChange={(event) =>
                                setDraft({
                                    ...draft,
                                    currencyCode: event.target.value as Draft["currencyCode"],
                                })
                            }
                        >
                            {["PEN", "USD", "EUR", "JPY", "KWD"].map((code) => (
                                <option key={code} value={code}>
                                    {code}
                                </option>
                            ))}
                        </select>
                    </div>
                    {(
                        [
                            "paymentTerms",
                            "deliveryTerms",
                            "serviceLocation",
                            "intakeExpectations",
                            "exclusions",
                        ] as const
                    ).map((field) => (
                        <div key={field}>
                            <Label htmlFor={`quote-${field}`}>{t(field)}</Label>
                            <textarea
                                id={`quote-${field}`}
                                className="mt-2 min-h-20 w-full rounded-control border border-border bg-surface p-3"
                                maxLength={10000}
                                value={draft[field] ?? ""}
                                onChange={(event) =>
                                    setDraft({ ...draft, [field]: event.target.value || null })
                                }
                            />
                        </div>
                    ))}
                    <div>
                        <Label htmlFor="quote-valid-until">{t("validUntil")}</Label>
                        <Input
                            id="quote-valid-until"
                            type="datetime-local"
                            value={validUntilInput}
                            onChange={(event) => {
                                setValidUntilInput(event.target.value);
                                setValidUntilChanged(true);
                            }}
                        />
                    </div>
                </section>
                <section
                    className="space-y-4 rounded-card border border-border bg-surface p-5"
                    aria-labelledby="quote-lines-heading"
                >
                    <h2 id="quote-lines-heading" className="font-display text-xl font-semibold">
                        {t("lines")}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t("serverCalculates")}</p>
                    {draft.lines.map((line, index) => (
                        <fieldset
                            key={index}
                            className="space-y-3 rounded-control border border-border p-4"
                        >
                            <legend className="px-1 font-semibold">
                                {t("line", { number: index + 1 })}
                            </legend>
                            <div>
                                <Label htmlFor={`quote-line-${index}-description`}>
                                    {t("description")}
                                </Label>
                                <textarea
                                    id={`quote-line-${index}-description`}
                                    required
                                    maxLength={10000}
                                    className="mt-2 min-h-20 w-full rounded-control border border-border bg-surface p-3"
                                    value={line.description}
                                    onChange={(event) =>
                                        setLine(index, { description: event.target.value })
                                    }
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div>
                                    <Label htmlFor={`quote-line-${index}-quantity`}>
                                        {t("quantity")}
                                    </Label>
                                    <Input
                                        id={`quote-line-${index}-quantity`}
                                        required
                                        inputMode="decimal"
                                        value={line.quantity}
                                        onChange={(event) =>
                                            setLine(index, { quantity: event.target.value })
                                        }
                                    />
                                </div>
                                <div>
                                    <Label htmlFor={`quote-line-${index}-unit`}>{t("unit")}</Label>
                                    <Input
                                        id={`quote-line-${index}-unit`}
                                        required
                                        maxLength={40}
                                        value={line.unit}
                                        onChange={(event) =>
                                            setLine(index, { unit: event.target.value })
                                        }
                                    />
                                </div>
                                <div>
                                    <Label htmlFor={`quote-line-${index}-price`}>
                                        {t("unitPrice")}
                                    </Label>
                                    <Input
                                        id={`quote-line-${index}-price`}
                                        required
                                        inputMode="decimal"
                                        value={line.unitPrice}
                                        onChange={(event) =>
                                            setLine(index, { unitPrice: event.target.value })
                                        }
                                    />
                                </div>
                            </div>
                            {line.adjustments.map((adjustment, adjustmentIndex) => (
                                <div
                                    key={adjustmentIndex}
                                    className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]"
                                >
                                    <div>
                                        <Label
                                            htmlFor={`quote-line-${index}-adjustment-${adjustmentIndex}-label`}
                                        >
                                            {t("adjustmentLabel")}
                                        </Label>
                                        <Input
                                            id={`quote-line-${index}-adjustment-${adjustmentIndex}-label`}
                                            required
                                            value={adjustment.label}
                                            onChange={(event) =>
                                                setLineAdjustment(index, adjustmentIndex, {
                                                    label: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div>
                                        <Label
                                            htmlFor={`quote-line-${index}-adjustment-${adjustmentIndex}-amount`}
                                        >
                                            {t("adjustmentAmount")}
                                        </Label>
                                        <Input
                                            id={`quote-line-${index}-adjustment-${adjustmentIndex}-amount`}
                                            required
                                            inputMode="decimal"
                                            value={adjustment.amount}
                                            onChange={(event) =>
                                                setLineAdjustment(index, adjustmentIndex, {
                                                    amount: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            setLine(index, {
                                                adjustments: line.adjustments.filter(
                                                    (_, i) => i !== adjustmentIndex,
                                                ),
                                            })
                                        }
                                    >
                                        {t("removeAdjustment")}
                                    </Button>
                                </div>
                            ))}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={line.adjustments.length >= 20}
                                    onClick={() =>
                                        setLine(index, {
                                            adjustments: [...line.adjustments, blankAdjustment()],
                                        })
                                    }
                                >
                                    {t("addLineAdjustment")}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        setDraft({
                                            ...draft,
                                            lines: draft.lines.filter((_, i) => i !== index),
                                        })
                                    }
                                >
                                    {t("removeLine")}
                                </Button>
                            </div>
                        </fieldset>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        disabled={draft.lines.length >= 100}
                        onClick={() => setDraft({ ...draft, lines: [...draft.lines, blankLine()] })}
                    >
                        {t("addLine")}
                    </Button>
                </section>
                <section
                    className="space-y-4 rounded-card border border-border bg-surface p-5"
                    aria-labelledby="quote-adjustments-heading"
                >
                    <h2
                        id="quote-adjustments-heading"
                        className="font-display text-xl font-semibold"
                    >
                        {t("quoteAdjustments")}
                    </h2>
                    {draft.adjustments.map((adjustment, index) => (
                        <div key={index} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
                            <div>
                                <Label htmlFor={`quote-adjustment-${index}-label`}>
                                    {t("adjustmentLabel")}
                                </Label>
                                <Input
                                    id={`quote-adjustment-${index}-label`}
                                    required
                                    value={adjustment.label}
                                    onChange={(event) =>
                                        setAdjustment(index, { label: event.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label htmlFor={`quote-adjustment-${index}-amount`}>
                                    {t("adjustmentAmount")}
                                </Label>
                                <Input
                                    id={`quote-adjustment-${index}-amount`}
                                    required
                                    inputMode="decimal"
                                    value={adjustment.amount}
                                    onChange={(event) =>
                                        setAdjustment(index, { amount: event.target.value })
                                    }
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                    setDraft({
                                        ...draft,
                                        adjustments: draft.adjustments.filter(
                                            (_, i) => i !== index,
                                        ),
                                    })
                                }
                            >
                                {t("removeAdjustment")}
                            </Button>
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        disabled={draft.adjustments.length >= 20}
                        onClick={() =>
                            setDraft({
                                ...draft,
                                adjustments: [...draft.adjustments, blankAdjustment()],
                            })
                        }
                    >
                        {t("addAdjustment")}
                    </Button>
                </section>
                {quote ? (
                    <div>
                        <Label htmlFor="quote-change-reason">{t("changeReason")}</Label>
                        <Input
                            id="quote-change-reason"
                            required
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                        />
                    </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={busy || Boolean(latest)}>
                        {busy ? t("saving") : quote ? t("saveDraft") : t("create")}
                    </Button>
                    <Link
                        className="inline-flex h-10 items-center text-primary underline"
                        href={
                            quote
                                ? `/${locale}/app/quotations/${quote.id}`
                                : `/${locale}/app/service-requests/${request?.id}`
                        }
                    >
                        {t("cancel")}
                    </Link>
                </div>
            </fieldset>
            {revision && revision.status !== "draft" ? (
                <p role="alert">{t("revisionLocked")}</p>
            ) : null}
        </form>
    );
}
