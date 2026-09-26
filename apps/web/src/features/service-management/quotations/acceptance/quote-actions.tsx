"use client";

import {
    acceptQuoteRevisionSchema,
    copyQuoteRevisionSchema,
    issueQuoteRevisionSchema,
    quoteVersionSchema,
    rejectQuoteRevisionSchema,
    type QuoteDetail,
} from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { Locale } from "@/i18n/locales";

import { fetchCurrentQuote, QuoteWebError, submitQuote } from "../api/browser-client";

type Props = Readonly<{
    quote: QuoteDetail;
    locale: Locale;
    canRevise: boolean;
    canDecide: boolean;
    canAccept: boolean;
}>;

export function QuoteActions({ quote, locale, canRevise, canDecide, canAccept }: Props) {
    const t = useTranslations("quotations");
    const router = useRouter();
    const [current, setCurrent] = useState(quote);
    const [latest, setLatest] = useState<QuoteDetail | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [reason, setReason] = useState("");
    const [channel, setChannel] = useState("");
    const [suppliedByName, setSuppliedByName] = useState("");
    const [externalReference, setExternalReference] = useState("");
    const acceptanceKey = useRef<string | null>(null);
    const hasDraft = current.revisions.some((item) => item.status === "draft");

    async function run(intent: string, revisionId: string | null, payload: unknown) {
        if (busy || latest) return;
        setError("");
        setBusy(true);
        try {
            const result = await submitQuote({
                intent,
                quoteId: current.id,
                ...(revisionId ? { revisionId } : {}),
                payload,
            });
            const updated = result ?? (await fetchCurrentQuote(current.id));
            setCurrent(updated);
            acceptanceKey.current = null;
            setReason("");
            setChannel("");
            setSuppliedByName("");
            setExternalReference("");
            router.refresh();
        } catch (cause) {
            if (cause instanceof QuoteWebError && cause.status === 409) {
                try {
                    setLatest(await fetchCurrentQuote(current.id));
                    setError(
                        t(
                            cause.code === "VERSION_CONFLICT"
                                ? "versionConflict"
                                : ["QUOTE_REVISION_EXPIRED", "QUOTE_VALIDITY_ELAPSED"].includes(
                                        cause.code,
                                    )
                                  ? "validityElapsed"
                                  : "actionUnavailable",
                        ),
                    );
                } catch {
                    setError(t("loadError"));
                }
            } else if (cause instanceof QuoteWebError && cause.status === 403)
                setError(t("forbidden"));
            else setError(t("saveError"));
        } finally {
            setBusy(false);
        }
    }

    function simple(
        intent:
            "copy" | "issue" | "discard" | "withdraw" | "expire" | "withdrawAcceptance" | "close",
        revisionId: string | null,
    ) {
        const input =
            intent === "copy"
                ? copyQuoteRevisionSchema.safeParse({
                      expectedVersion: current.version,
                      sourceRevisionId: revisionId,
                  })
                : intent === "issue"
                  ? issueQuoteRevisionSchema.safeParse({
                        expectedVersion: current.version,
                        channel: channel.trim(),
                    })
                  : quoteVersionSchema.safeParse({
                        expectedVersion: current.version,
                        reason: reason.trim(),
                    });
        if (!input.success) {
            setError(t("validationError"));
            return;
        }
        void run(
            intent,
            intent === "copy" || intent === "close" || intent === "withdrawAcceptance"
                ? null
                : revisionId,
            input.data,
        );
    }

    function accept(revisionId: string) {
        acceptanceKey.current ??= crypto.randomUUID();
        const input = acceptQuoteRevisionSchema.safeParse({
            expectedVersion: current.version,
            idempotencyKey: acceptanceKey.current,
            revisionId,
            agreementAt: null,
            suppliedByName: suppliedByName.trim() || null,
            suppliedByContactId: null,
            channel: channel.trim(),
            externalReference: externalReference.trim() || null,
        });
        if (!input.success) {
            setError(t("validationError"));
            return;
        }
        void run("accept", null, input.data);
    }

    function reject(revisionId: string) {
        const input = rejectQuoteRevisionSchema.safeParse({
            expectedVersion: current.version,
            revisionId,
            reason: reason.trim(),
            channel: channel.trim(),
            suppliedByName: suppliedByName.trim() || null,
        });
        if (!input.success) {
            setError(t("validationError"));
            return;
        }
        void run("reject", null, input.data);
    }

    if (!canRevise && !canDecide) return null;
    return (
        <section
            aria-labelledby="quote-actions-heading"
            className="space-y-4 rounded-card border border-border bg-surface p-5"
        >
            <h2 id="quote-actions-heading" className="font-display text-xl font-semibold">
                {t("actions")}
            </h2>
            {error ? (
                <p role="alert" className="rounded-control border border-destructive/30 p-3">
                    {error}
                </p>
            ) : null}
            {latest ? (
                <div role="status" className="space-y-3 rounded-control border border-border p-4">
                    <p>{t("latestVersion", { version: latest.version })}</p>
                    <p>{t("conflictReviewHint")}</p>
                    <Link
                        href={`/${locale}/app/quotations/${current.id}`}
                        target="_blank"
                        className="text-primary underline"
                    >
                        {t("reviewLatest")}
                    </Link>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            setCurrent(latest);
                            setLatest(null);
                            setError("");
                            acceptanceKey.current = null;
                            router.refresh();
                        }}
                    >
                        {t("loadLatest")}
                    </Button>
                </div>
            ) : null}
            <fieldset disabled={busy || Boolean(latest)} className="space-y-4" aria-busy={busy}>
                <legend className="sr-only">{t("actions")}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="quote-action-channel">{t("channel")}</Label>
                        <Input
                            id="quote-action-channel"
                            value={channel}
                            maxLength={120}
                            onChange={(event) => {
                                setChannel(event.target.value);
                                acceptanceKey.current = null;
                            }}
                        />
                    </div>
                    <div>
                        <Label htmlFor="quote-action-person">{t("suppliedByName")}</Label>
                        <Input
                            id="quote-action-person"
                            value={suppliedByName}
                            maxLength={120}
                            onChange={(event) => {
                                setSuppliedByName(event.target.value);
                                acceptanceKey.current = null;
                            }}
                        />
                    </div>
                    <div>
                        <Label htmlFor="quote-action-external-reference">
                            {t("externalReference")}
                        </Label>
                        <Input
                            id="quote-action-external-reference"
                            value={externalReference}
                            maxLength={120}
                            onChange={(event) => {
                                setExternalReference(event.target.value);
                                acceptanceKey.current = null;
                            }}
                        />
                    </div>
                    <div>
                        <Label htmlFor="quote-action-reason">{t("reason")}</Label>
                        <Input
                            id="quote-action-reason"
                            value={reason}
                            maxLength={10000}
                            onChange={(event) => setReason(event.target.value)}
                        />
                    </div>
                </div>
                {current.revisions.map((revision) => {
                    const offered = revision.status === "offered";
                    const draft = revision.status === "draft";
                    const canCopy =
                        canRevise &&
                        current.status !== "closed" &&
                        !hasDraft &&
                        revision.status !== "discarded";
                    if (
                        !canCopy &&
                        !(canRevise && (draft || offered)) &&
                        !(canDecide && offered && current.status === "open")
                    )
                        return null;
                    return (
                        <div key={revision.id} className="space-y-3 border-t border-border pt-4">
                            <h3 className="font-semibold">
                                {t("revision", { number: revision.revisionNumber })} ·{" "}
                                {t(`revisionStatuses.${revision.status}`)}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {canRevise && draft ? (
                                    <Link
                                        className="inline-flex h-10 items-center rounded-control border border-border px-3 text-primary underline"
                                        href={`/${locale}/app/quotations/${current.id}/revisions/${revision.id}/edit`}
                                    >
                                        {t("editDraft")}
                                    </Link>
                                ) : null}
                                {canRevise && draft ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => simple("issue", revision.id)}
                                    >
                                        {t("issueRevision")}
                                    </Button>
                                ) : null}
                                {canRevise && draft ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => simple("discard", revision.id)}
                                    >
                                        {t("discardDraft")}
                                    </Button>
                                ) : null}
                                {canCopy ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => simple("copy", revision.id)}
                                    >
                                        {t("copyRevision")}
                                    </Button>
                                ) : null}
                                {canRevise && offered ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => simple("withdraw", revision.id)}
                                    >
                                        {t("withdrawOffer")}
                                    </Button>
                                ) : null}
                                {canDecide && offered && revision.validUntil ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => simple("expire", revision.id)}
                                    >
                                        {t("recordExpiry")}
                                    </Button>
                                ) : null}
                                {canAccept && offered && current.status === "open" ? (
                                    <Button type="button" onClick={() => accept(revision.id)}>
                                        {t("acceptRevision", { number: revision.revisionNumber })}
                                    </Button>
                                ) : null}
                                {canDecide && offered && current.status === "open" ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => reject(revision.id)}
                                    >
                                        {t("rejectRevision", { number: revision.revisionNumber })}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
                {canDecide && current.activeAcceptanceId ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => simple("withdrawAcceptance", null)}
                    >
                        {t("withdrawAcceptance")}
                    </Button>
                ) : null}
                {canRevise && current.status !== "closed" ? (
                    <Button type="button" variant="outline" onClick={() => simple("close", null)}>
                        {t("closeQuote")}
                    </Button>
                ) : null}
            </fieldset>
        </section>
    );
}
