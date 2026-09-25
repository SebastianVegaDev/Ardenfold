import { Button, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { formatDate } from "@/i18n/formatters";
import type { Locale } from "@/i18n/locales";
import { formattingLocales } from "@/i18n/locales";

import { getCustomer, listServiceRequests, ServiceRequestApiError } from "../api/request-api";

type Props = Readonly<{
    locale: Locale;
    query: { status?: string; cursor?: string; notice?: string };
}>;

export async function RequestsListScreen({ locale, query }: Props) {
    const t = await getTranslations("serviceRequests");
    const context = await getActiveOrganizationSession();
    const active = await getActiveOrganization(
        context.session.accessToken,
        context.organization.id,
    );
    if (!active.permissions.includes("service_requests.read")) {
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {t("forbidden")}
                </p>
            </div>
        );
    }
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.cursor) params.set("cursor", query.cursor);
    let result;
    try {
        result = await listServiceRequests(
            context.session.accessToken,
            context.organization.id,
            params,
        );
    } catch (error) {
        const message =
            error instanceof ServiceRequestApiError && error.status === 403
                ? t("forbidden")
                : error instanceof ServiceRequestApiError && error.status === 400
                  ? t("invalidFilters")
                  : t("loadError");
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {message}
                </p>
            </div>
        );
    }
    const customers = new Map<string, string>();
    if (active.permissions.includes("parties.read")) {
        await Promise.all(
            [...new Set(result.data.map((item) => item.customerPartyId))].map(async (id) => {
                try {
                    customers.set(
                        id,
                        (
                            await getCustomer(
                                context.session.accessToken,
                                context.organization.id,
                                id,
                            )
                        ).displayName,
                    );
                } catch {
                    customers.set(id, id);
                }
            }),
        );
    }
    const nextParams = new URLSearchParams(params);
    if (result.nextCursor) nextParams.set("cursor", result.nextCursor);
    const preferences = {
        language: locale,
        formattingLocale: formattingLocales[locale],
        timeZone: active.defaultTimeZone,
    };

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                    <p className="mt-2 text-muted-foreground">{t("description")}</p>
                </div>
                {active.permissions.includes("service_requests.write") &&
                active.permissions.includes("parties.read") ? (
                    <Link
                        className="inline-flex h-10 items-center rounded-control bg-primary px-4 text-primary-foreground"
                        href={`/${locale}/app/service-requests/new`}
                    >
                        {t("newRequest")}
                    </Link>
                ) : null}
            </header>
            {query.notice ? <p role="status">{t("saved")}</p> : null}
            <form
                method="get"
                action={`/${locale}/app/service-requests`}
                className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4"
            >
                <div>
                    <Label htmlFor="request-status-filter">{t("status")}</Label>
                    <select
                        id="request-status-filter"
                        name="status"
                        defaultValue={query.status ?? ""}
                        className="mt-2 h-10 min-w-44 rounded-control border border-border bg-surface px-3"
                    >
                        <option value="">{t("allStatuses")}</option>
                        <option value="active">{t("statuses.active")}</option>
                        <option value="cancelled">{t("statuses.cancelled")}</option>
                        <option value="closed">{t("statuses.closed")}</option>
                    </select>
                </div>
                <Button type="submit">{t("applyFilters")}</Button>
                <Link
                    className="inline-flex h-10 items-center px-3 text-primary underline"
                    href={`/${locale}/app/service-requests`}
                >
                    {t("clearFilters")}
                </Link>
            </form>
            {result.data.length ? (
                <ul className="space-y-3" aria-label={t("title")}>
                    {result.data.map((item) => (
                        <li
                            key={item.id}
                            className="rounded-card border border-border bg-surface p-5"
                        >
                            <Link
                                className="font-display text-lg font-semibold text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                                href={`/${locale}/app/service-requests/${item.id}`}
                            >
                                {item.summary}
                            </Link>
                            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                                <div>
                                    <dt className="text-muted-foreground">{t("customer")}</dt>
                                    <dd>
                                        {customers.get(item.customerPartyId) ??
                                            item.customerPartyId}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-muted-foreground">{t("status")}</dt>
                                    <dd>{t(`statuses.${item.status}`)}</dd>
                                </div>
                                <div>
                                    <dt className="text-muted-foreground">{t("createdAt")}</dt>
                                    <dd>{formatDate(new Date(item.createdAt), preferences)}</dd>
                                </div>
                            </dl>
                        </li>
                    ))}
                </ul>
            ) : (
                <p
                    className="rounded-card border border-border bg-surface p-8 text-center"
                    role="status"
                >
                    {query.status ? t("noResults") : t("empty")}
                </p>
            )}
            {result.nextCursor ? (
                <Link
                    className="inline-flex h-10 items-center text-primary underline"
                    href={`/${locale}/app/service-requests?${nextParams.toString()}`}
                >
                    {t("nextPage")}
                </Link>
            ) : null}
        </div>
    );
}
