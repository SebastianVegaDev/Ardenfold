import { Button, Input, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";
import { listParties, PartyApiError } from "@/parties/api-client";

type Props = Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{
        name?: string;
        q?: string;
        sort?: string;
        role?: string;
        kind?: string;
        status?: string;
        cursor?: string;
        notice?: string;
    }>;
}>;

export default async function PartiesPage({ params, searchParams }: Props) {
    const [{ locale }, query, t, context] = await Promise.all([
        params,
        searchParams,
        getTranslations("parties"),
        getActiveOrganizationSession(),
    ]);
    const active = await getActiveOrganization(
        context.session.accessToken,
        context.organization.id,
    );
    if (!active.permissions.includes("parties.read")) {
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {t("forbidden")}
                </p>
            </div>
        );
    }
    const canWrite = active.permissions.includes("parties.write");
    const paramsForApi = new URLSearchParams();
    if (query.name) paramsForApi.set("name", query.name);
    if (query.q) paramsForApi.set("q", query.q);
    if (query.sort) paramsForApi.set("sort", query.sort);
    if (query.role) paramsForApi.set("role", query.role);
    if (query.kind) paramsForApi.set("kind", query.kind);
    if (query.status) paramsForApi.set("status", query.status);
    if (query.cursor) paramsForApi.set("cursor", query.cursor);
    let result;
    try {
        result = await listParties(
            context.session.accessToken,
            context.organization.id,
            paramsForApi,
        );
    } catch (error) {
        if (error instanceof PartyApiError && error.status === 403) {
            return (
                <div className="mx-auto max-w-6xl p-6 sm:p-8">
                    <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                    <p role="alert" className="mt-4">
                        {t("forbidden")}
                    </p>
                </div>
            );
        }
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {error instanceof PartyApiError && error.status === 400
                        ? t("invalidFilters")
                        : t("loadError")}
                </p>
            </div>
        );
    }
    const nextParams = new URLSearchParams(paramsForApi);
    if (result.nextCursor) nextParams.set("cursor", result.nextCursor);
    const filtered = Boolean(query.name || query.q || query.role || query.kind || query.status);

    return (
        <div className="mx-auto max-w-6xl space-y-8 p-6 sm:p-8">
            <header>
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p className="mt-2 text-muted-foreground">{t("description")}</p>
                {query.notice ? (
                    <p role="status" className="mt-3 text-sm">
                        {query.notice === "success" ? t("success") : t("error")}
                    </p>
                ) : null}
            </header>

            <form
                action={`/${locale}/app/parties`}
                className="grid gap-4 rounded-card border border-border bg-surface p-5 sm:grid-cols-4"
                method="get"
            >
                <div className="sm:col-span-2">
                    <Label htmlFor="party-search">{t("search")}</Label>
                    <Input
                        id="party-search"
                        name="q"
                        defaultValue={query.q ?? query.name ?? ""}
                        minLength={2}
                        maxLength={100}
                    />
                </div>
                <div>
                    <Label htmlFor="party-role-filter">{t("role")}</Label>
                    <select
                        id="party-role-filter"
                        name="role"
                        defaultValue={query.role ?? ""}
                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                    >
                        <option value="">{t("allRoles")}</option>
                        <option value="customer">{t("roles.customer")}</option>
                        <option value="provider">{t("roles.provider")}</option>
                    </select>
                </div>
                <div>
                    <Label htmlFor="party-kind-filter">{t("kind")}</Label>
                    <select
                        id="party-kind-filter"
                        name="kind"
                        defaultValue={query.kind ?? ""}
                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                    >
                        <option value="">{t("allKinds")}</option>
                        <option value="organization">{t("kinds.organization")}</option>
                        <option value="individual">{t("kinds.individual")}</option>
                    </select>
                </div>
                <div>
                    <Label htmlFor="party-status-filter">{t("status")}</Label>
                    <select
                        id="party-status-filter"
                        name="status"
                        defaultValue={query.status ?? ""}
                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                    >
                        <option value="">{t("allStatuses")}</option>
                        <option value="active">{t("statuses.active")}</option>
                        <option value="archived">{t("statuses.archived")}</option>
                    </select>
                </div>
                <div>
                    <Label htmlFor="party-sort">{t("sort")}</Label>
                    <select
                        id="party-sort"
                        name="sort"
                        defaultValue={query.sort ?? "name_asc"}
                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                    >
                        <option value="name_asc">{t("sorts.name_asc")}</option>
                        <option value="name_desc">{t("sorts.name_desc")}</option>
                        <option value="updated_desc">{t("sorts.updated_desc")}</option>
                    </select>
                </div>
                <div className="flex gap-3 sm:col-span-4">
                    <Button type="submit">{t("applyFilters")}</Button>
                    <Link
                        className="inline-flex h-10 items-center rounded-control px-3 text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                        href={`/${locale}/app/parties`}
                    >
                        {t("clearFilters")}
                    </Link>
                </div>
            </form>

            {canWrite ? (
                <details className="rounded-card border border-border bg-surface p-5">
                    <summary className="cursor-pointer font-display text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {t("create.title")}
                    </summary>
                    <form
                        action="/auth/party-management"
                        method="post"
                        className="mt-5 grid gap-4 sm:grid-cols-2"
                    >
                        <input type="hidden" name="intent" value="create" />
                        <input type="hidden" name="locale" value={locale} />
                        <div>
                            <Label htmlFor="create-party-kind">{t("kind")}</Label>
                            <select
                                id="create-party-kind"
                                name="kind"
                                className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                            >
                                <option value="organization">{t("kinds.organization")}</option>
                                <option value="individual">{t("kinds.individual")}</option>
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="create-party-name">{t("displayName")}</Label>
                            <Input
                                id="create-party-name"
                                name="displayName"
                                required
                                maxLength={200}
                            />
                        </div>
                        <div>
                            <Label htmlFor="create-party-legal-name">{t("legalName")}</Label>
                            <Input id="create-party-legal-name" name="legalName" maxLength={200} />
                        </div>
                        <fieldset className="flex flex-wrap gap-4">
                            <legend className="text-sm font-medium">{t("role")}</legend>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    name="roles"
                                    value="customer"
                                    defaultChecked
                                />
                                {t("roles.customer")}
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" name="roles" value="provider" />
                                {t("roles.provider")}
                            </label>
                        </fieldset>
                        <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
                            {t("create.submit")}
                        </Button>
                    </form>
                </details>
            ) : null}

            <section
                aria-labelledby="party-results-heading"
                className="rounded-card border border-border bg-surface p-5"
            >
                <h2 id="party-results-heading" className="font-display text-xl font-semibold">
                    {t("list.title")}
                </h2>
                {result.data.length === 0 ? (
                    <p className="mt-4 text-muted-foreground">
                        {filtered ? t("list.noResults") : t("list.empty")}
                    </p>
                ) : (
                    <ul className="mt-4 divide-y divide-border">
                        {result.data.map((party) => (
                            <li
                                key={party.id}
                                className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div>
                                    <Link
                                        className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                                        href={`/${locale}/app/parties/${party.id}`}
                                    >
                                        {party.displayName}
                                    </Link>
                                    <p className="text-sm text-muted-foreground">
                                        {t(`kinds.${party.kind}`)} ·{" "}
                                        {party.roles.map((role) => t(`roles.${role}`)).join(", ")} ·{" "}
                                        {t(`statuses.${party.status}`)}
                                    </p>
                                </div>
                                <Link
                                    className="text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                                    href={`/${locale}/app/parties/${party.id}`}
                                >
                                    {t("list.view")}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
                {result.nextCursor ? (
                    <Link
                        className="mt-5 inline-block rounded-control border border-border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                        href={`/${locale}/app/parties?${nextParams.toString()}`}
                    >
                        {t("list.next")}
                    </Link>
                ) : null}
            </section>
        </div>
    );
}
