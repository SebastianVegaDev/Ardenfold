import { identifierSchema, requestTimelineQuerySchema } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";

import { getRequestTimeline, OperationalViewApiError } from "../api/operations-api";

const eventLabels = {
    "request.created": "events.request.created",
    "request.updated": "events.request.updated",
    "request.cancelled": "events.request.cancelled",
    "request.closed": "events.request.closed",
    "quote.created": "events.quote.created",
    "quote.accepted": "events.quote.accepted",
    "quote.closed": "events.quote.closed",
    "quote.revision.created": "events.quote.revision.created",
    "quote.revision.edited": "events.quote.revision.edited",
    "quote.revision.issued": "events.quote.revision.issued",
    "quote.revision.superseded": "events.quote.revision.superseded",
    "quote.revision.discarded": "events.quote.revision.discarded",
    "quote.revision.withdrawn": "events.quote.revision.withdrawn",
    "quote.revision.expired": "events.quote.revision.expired",
    "quote.revision.rejected": "events.quote.revision.rejected",
    "quote.acceptance.withdrawn": "events.quote.acceptance.withdrawn",
    "work_order.authorized": "events.work_order.authorized",
    "work_order.prepared": "events.work_order.prepared",
    "work_order.ready": "events.work_order.ready",
    "work_order.planned": "events.work_order.planned",
    "work_order.cancelled": "events.work_order.cancelled",
    "work_item.created": "events.work_item.created",
    "work_item.updated": "events.work_item.updated",
    "work_item.ready": "events.work_item.ready",
    "work_item.planned": "events.work_item.planned",
    "work_item.cancelled": "events.work_item.cancelled",
    "receipt.recorded": "events.receipt.recorded",
    "receipt.corrected": "events.receipt.corrected",
    "receipt.reconciled": "events.receipt.reconciled",
    "receipt.voided": "events.receipt.voided",
} as const;

export async function RequestTimelineScreen({
    locale,
    requestId,
    cursor,
}: Readonly<{
    locale: Locale;
    requestId: string;
    cursor?: string;
}>) {
    if (!identifierSchema.safeParse(requestId).success) notFound();
    const t = await getTranslations("operations");
    const { session, organization } = await getActiveOrganizationSession();
    const active = await getActiveOrganization(session.accessToken, organization.id);
    const required = [
        "service_requests.read",
        "quotations.read",
        "work_orders.read",
        "receipts.read",
        "parties.read",
        "assets.read",
    ] as const;
    if (!required.every((permission) => active.permissions.includes(permission)))
        return (
            <p role="alert" className="mx-auto max-w-5xl p-6">
                {t("forbidden")}
            </p>
        );
    const parsed = requestTimelineQuerySchema.safeParse(cursor ? { cursor } : {});
    if (!parsed.success)
        return (
            <p role="alert" className="mx-auto max-w-5xl p-6">
                {t("invalidFilters")}
            </p>
        );
    const params = new URLSearchParams();
    if (parsed.data.cursor) params.set("cursor", parsed.data.cursor);
    let result;
    try {
        result = await getRequestTimeline(session.accessToken, organization.id, requestId, params);
    } catch (error) {
        if (error instanceof OperationalViewApiError && error.status === 404) notFound();
        return (
            <p role="alert" className="mx-auto max-w-5xl p-6">
                {t("loadError")}
            </p>
        );
    }
    const format = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: active.defaultTimeZone,
    });
    const next = new URLSearchParams();
    if (result.nextCursor) next.set("cursor", result.nextCursor);
    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
            <Link
                className="text-primary underline"
                href={`/${locale}/app/service-requests/${requestId}`}
            >
                {t("backToRequest")}
            </Link>
            <header>
                <h1 className="font-display text-3xl font-semibold">{t("timelineTitle")}</h1>
                <p className="mt-2 break-words">{result.request.summary}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("businessHistoryHint")}</p>
            </header>
            <section
                className="rounded-card border border-border bg-surface p-5"
                aria-labelledby="current-context-heading"
            >
                <h2 id="current-context-heading" className="font-display text-xl font-semibold">
                    {t("currentContext")}
                </h2>
                <p className="mt-2">
                    {t("customerCurrent")}: {result.currentCustomer.name}
                </p>
                {result.currentAssets.length ? (
                    <ul className="mt-2 list-inside list-disc">
                        {result.currentAssets.map((asset) => (
                            <li key={asset.id}>
                                {t("assetCurrent")}: {asset.name}
                            </li>
                        ))}
                    </ul>
                ) : null}
            </section>
            <section aria-labelledby="timeline-heading" className="space-y-3">
                <h2 id="timeline-heading" className="font-display text-xl font-semibold">
                    {t("eventsTitle")}
                </h2>
                {result.data.length ? (
                    <ol className="space-y-3">
                        {result.data.map((event) => {
                            const kindKey =
                                eventLabels[
                                    `${event.source}.${event.kind}` as keyof typeof eventLabels
                                ];
                            return (
                                <li
                                    key={event.key}
                                    className="rounded-card border border-border bg-surface p-5"
                                >
                                    <h3 className="font-semibold">
                                        {kindKey ? t(kindKey) : t(`sources.${event.source}`)}
                                    </h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {format.format(new Date(event.occurredAt))}
                                    </p>
                                    {event.reason ? (
                                        <p className="mt-2 break-words">
                                            {t("reason")}: {event.reason}
                                        </p>
                                    ) : null}
                                    <div className="mt-3 flex flex-wrap gap-4 text-sm">
                                        {event.quoteId ? (
                                            <Link
                                                className="text-primary underline"
                                                href={`/${locale}/app/quotations/${event.quoteId}`}
                                            >
                                                {t("viewQuote")}
                                            </Link>
                                        ) : null}
                                        {event.workOrderId ? (
                                            <Link
                                                className="text-primary underline"
                                                href={`/${locale}/app/work-orders/${event.workOrderId}`}
                                            >
                                                {t("viewWorkOrder")}
                                            </Link>
                                        ) : null}
                                        {event.receiptId ? (
                                            <Link
                                                className="text-primary underline"
                                                href={`/${locale}/app/receipts/${event.receiptId}`}
                                            >
                                                {t("viewReceipt")}
                                            </Link>
                                        ) : null}
                                        {event.assetId ? (
                                            <Link
                                                className="text-primary underline"
                                                href={`/${locale}/app/assets/${event.assetId}`}
                                            >
                                                {t("viewAsset")}
                                            </Link>
                                        ) : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                ) : (
                    <p className="rounded-card border border-border bg-surface p-5">
                        {t("noEvents")}
                    </p>
                )}
            </section>
            {result.nextCursor ? (
                <Link
                    className="text-primary underline"
                    href={`/${locale}/app/service-requests/${requestId}/timeline?${next}`}
                >
                    {t("olderEvents")}
                </Link>
            ) : null}
        </div>
    );
}
