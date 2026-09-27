import { operationalQueueQuerySchema } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";

import { listOperationalQueue } from "../api/operations-api";

type Query = { kind?: string; cursor?: string };

export async function OperationalQueuesScreen({
    locale,
    query,
}: Readonly<{ locale: Locale; query: Query }>) {
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
            <p role="alert" className="mx-auto max-w-6xl p-6">
                {t("forbidden")}
            </p>
        );
    const parsed = operationalQueueQuerySchema.safeParse({
        kind: query.kind ?? "commercial_follow_up",
        ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    if (!parsed.success)
        return (
            <p role="alert" className="mx-auto max-w-6xl p-6">
                {t("invalidFilters")}
            </p>
        );
    const params = new URLSearchParams({ kind: parsed.data.kind });
    if (parsed.data.cursor) params.set("cursor", parsed.data.cursor);
    let result;
    try {
        result = await listOperationalQueue(session.accessToken, organization.id, params);
    } catch {
        return (
            <p role="alert" className="mx-auto max-w-6xl p-6">
                {t("loadError")}
            </p>
        );
    }
    const next = new URLSearchParams(params);
    if (result.nextCursor) next.set("cursor", result.nextCursor);
    const format = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: active.defaultTimeZone,
    });
    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
            <header>
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p className="mt-2 text-muted-foreground">{t("description")}</p>
            </header>
            <form
                method="get"
                action={`/${locale}/app/operations`}
                className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4"
            >
                <div>
                    <label htmlFor="operational-queue" className="block text-sm font-medium">
                        {t("queue")}
                    </label>
                    <select
                        id="operational-queue"
                        name="kind"
                        defaultValue={parsed.data.kind}
                        className="mt-2 min-h-10 max-w-full rounded-control border border-border bg-surface px-3"
                    >
                        {operationalQueueQuerySchema.shape.kind.options.map((kind) => (
                            <option key={kind} value={kind}>
                                {t(`queues.${kind}`)}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="submit"
                    className="min-h-10 rounded-control bg-primary px-4 text-primary-foreground"
                >
                    {t("showQueue")}
                </button>
            </form>
            <section aria-labelledby="queue-heading" className="space-y-3">
                <h2 id="queue-heading" className="font-display text-xl font-semibold">
                    {t(`queues.${parsed.data.kind}`)}
                </h2>
                {result.data.length ? (
                    <ul className="grid gap-3">
                        {result.data.map((entry) => {
                            const href = entry.workOrderId
                                ? `/${locale}/app/work-orders/${entry.workOrderId}`
                                : entry.quoteId
                                  ? `/${locale}/app/quotations/${entry.quoteId}`
                                  : `/${locale}/app/service-requests/${entry.requestId}`;
                            return (
                                <li
                                    key={entry.subjectId}
                                    className="rounded-card border border-border bg-surface p-5"
                                >
                                    <Link
                                        className="font-display text-lg font-semibold text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                                        href={href}
                                    >
                                        {entry.reference}
                                    </Link>
                                    <p className="mt-1 break-words">{entry.title}</p>
                                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                                        <div>
                                            <dt className="text-muted-foreground">
                                                {t("customerCurrent")}
                                            </dt>
                                            <dd>{entry.customer.currentName}</dd>
                                        </div>
                                        {entry.asset ? (
                                            <div>
                                                <dt className="text-muted-foreground">
                                                    {t("assetCurrent")}
                                                </dt>
                                                <dd>{entry.asset.currentName}</dd>
                                            </div>
                                        ) : null}
                                        {entry.receiptStatus ? (
                                            <div>
                                                <dt className="text-muted-foreground">
                                                    {t("receiptStatus")}
                                                </dt>
                                                <dd>{t(`receipt.${entry.receiptStatus}`)}</dd>
                                            </div>
                                        ) : null}
                                        <div>
                                            <dt className="text-muted-foreground">{t("since")}</dt>
                                            <dd>{format.format(new Date(entry.occurredAt))}</dd>
                                        </div>
                                    </dl>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="rounded-card border border-border bg-surface p-6">{t("empty")}</p>
                )}
            </section>
            {result.nextCursor ? (
                <Link className="text-primary underline" href={`/${locale}/app/operations?${next}`}>
                    {t("nextPage")}
                </Link>
            ) : null}
        </div>
    );
}
