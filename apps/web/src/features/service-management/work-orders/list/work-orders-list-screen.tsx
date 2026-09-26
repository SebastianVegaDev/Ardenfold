import { workOrderListQuerySchema } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";

import { listWorkOrders, WorkOrderApiError } from "../api/work-order-api";

type Props = Readonly<{ locale: Locale; query: { status?: string; cursor?: string } }>;

export async function WorkOrdersListScreen({ locale, query }: Props) {
    const t = await getTranslations("workOrders");
    const { session, organization } = await getActiveOrganizationSession();
    const active = await getActiveOrganization(session.accessToken, organization.id);
    if (!active.permissions.includes("work_orders.read"))
        return (
            <p role="alert" className="mx-auto max-w-6xl p-6">
                {t("forbidden")}
            </p>
        );
    const parsed = workOrderListQuerySchema.safeParse({
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    if (!parsed.success)
        return (
            <p role="alert" className="mx-auto max-w-6xl p-6">
                {t("invalidFilters")}
            </p>
        );
    const params = new URLSearchParams();
    if (parsed.data.status) params.set("status", parsed.data.status);
    if (parsed.data.cursor) params.set("cursor", parsed.data.cursor);
    let result;
    try {
        result = await listWorkOrders(session.accessToken, organization.id, params);
    } catch (error) {
        return (
            <p role="alert" className="mx-auto max-w-6xl p-6">
                {error instanceof WorkOrderApiError && error.status === 403
                    ? t("forbidden")
                    : t("loadError")}
            </p>
        );
    }
    const next = new URLSearchParams(params);
    if (result.nextCursor) next.set("cursor", result.nextCursor);
    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                    <p className="mt-2 text-muted-foreground">{t("description")}</p>
                </div>
                {active.permissions.includes("work_orders.write") &&
                active.permissions.includes("quotations.read") ? (
                    <Link
                        className="text-primary underline"
                        href={`/${locale}/app/quotations?status=accepted`}
                    >
                        {t("createFromQuote")}
                    </Link>
                ) : null}
            </header>
            <form method="get" className="flex flex-wrap items-end gap-3">
                <div>
                    <label htmlFor="work-order-status" className="block text-sm font-medium">
                        {t("status")}
                    </label>
                    <select
                        id="work-order-status"
                        name="status"
                        defaultValue={parsed.data.status ?? ""}
                        className="mt-2 h-10 rounded-control border border-border bg-surface px-3"
                    >
                        <option value="">{t("allStatuses")}</option>
                        {(["planned", "ready", "cancelled"] as const).map((status) => (
                            <option key={status} value={status}>
                                {t(`statuses.${status}`)}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    className="h-10 rounded-control bg-primary px-4 text-primary-foreground"
                    type="submit"
                >
                    {t("applyFilters")}
                </button>
            </form>
            {result.data.length ? (
                <ul className="grid gap-3">
                    {result.data.map((order) => (
                        <li key={order.id}>
                            <Link
                                href={`/${locale}/app/work-orders/${order.id}`}
                                className="block rounded-card border border-border bg-surface p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                            >
                                <span className="font-semibold">{order.reference}</span>
                                <span className="ml-3 text-sm text-muted-foreground">
                                    {t(`statuses.${order.status}`)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="rounded-card border border-border bg-surface p-5">
                    {query.status ? t("noResults") : t("empty")}
                </p>
            )}
            {result.nextCursor ? (
                <Link
                    className="text-primary underline"
                    href={`/${locale}/app/work-orders?${next}`}
                >
                    {t("nextPage")}
                </Link>
            ) : null}
        </div>
    );
}
