import { Button, Input, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { listAssets, AssetApiError } from "@/features/assets/api-client";
import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";

type Props = Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{
        name?: string;
        q?: string;
        sort?: string;
        status?: string;
        lifecycle?: string;
        manufacturer?: string;
        model?: string;
        classification?: string;
        cursor?: string;
        notice?: string;
    }>;
}>;

export default async function AssetsPage({ params, searchParams }: Props) {
    const [{ locale }, query, t, context] = await Promise.all([
        params,
        searchParams,
        getTranslations("assets"),
        getActiveOrganizationSession(),
    ]);
    const active = await getActiveOrganization(
        context.session.accessToken,
        context.organization.id,
    );
    if (!active.permissions.includes("assets.read")) {
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {t("forbidden")}
                </p>
            </div>
        );
    }
    const canWrite = active.permissions.includes("assets.write");
    const paramsForApi = new URLSearchParams();
    if (query.name) paramsForApi.set("name", query.name);
    if (query.q) paramsForApi.set("q", query.q);
    if (query.sort) paramsForApi.set("sort", query.sort);
    if (query.status) paramsForApi.set("status", query.status);
    if (query.lifecycle) paramsForApi.set("lifecycle", query.lifecycle);
    if (query.manufacturer) paramsForApi.set("manufacturer", query.manufacturer);
    if (query.model) paramsForApi.set("model", query.model);
    if (query.classification) paramsForApi.set("classification", query.classification);
    if (query.cursor) paramsForApi.set("cursor", query.cursor);
    let result;
    try {
        result = await listAssets(
            context.session.accessToken,
            context.organization.id,
            paramsForApi,
        );
    } catch (error) {
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {error instanceof AssetApiError && error.status === 403
                        ? t("forbidden")
                        : error instanceof AssetApiError && error.status === 400
                          ? t("invalidFilters")
                          : t("loadError")}
                </p>
            </div>
        );
    }
    const nextParams = new URLSearchParams(paramsForApi);
    if (result.nextCursor) nextParams.set("cursor", result.nextCursor);
    const filtered = Boolean(
        query.name ||
        query.q ||
        query.status ||
        query.lifecycle ||
        query.manufacturer ||
        query.model ||
        query.classification,
    );

    return (
        <div className="mx-auto max-w-6xl space-y-8 p-6 sm:p-8">
            <header>
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p className="mt-2 text-muted-foreground">{t("description")}</p>
                {canWrite ? (
                    <Link
                        className="mt-3 inline-flex text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                        href={`/${locale}/app/imports`}
                    >
                        {t("importCsv")}
                    </Link>
                ) : null}
                {query.notice ? (
                    <p
                        role={query.notice === "success" ? "status" : "alert"}
                        className="mt-3 text-sm"
                    >
                        {query.notice === "success" ? t("success") : t("error")}
                    </p>
                ) : null}
            </header>

            <form
                action={`/${locale}/app/assets`}
                className="grid gap-4 rounded-card border border-border bg-surface p-5 sm:grid-cols-4"
                method="get"
            >
                <div className="sm:col-span-2">
                    <Label htmlFor="asset-search">{t("search")}</Label>
                    <Input
                        id="asset-search"
                        name="q"
                        defaultValue={query.q ?? query.name ?? ""}
                        minLength={2}
                        maxLength={100}
                    />
                </div>
                <div>
                    <Label htmlFor="asset-status-filter">{t("status")}</Label>
                    <select
                        id="asset-status-filter"
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
                    <Label htmlFor="asset-lifecycle-filter">{t("lifecycleLabel")}</Label>
                    <select
                        id="asset-lifecycle-filter"
                        name="lifecycle"
                        defaultValue={query.lifecycle ?? ""}
                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                    >
                        <option value="">{t("allLifecycles")}</option>
                        <option value="registered">{t("lifecycles.registered")}</option>
                        <option value="in_service">{t("lifecycles.in_service")}</option>
                        <option value="out_of_service">{t("lifecycles.out_of_service")}</option>
                        <option value="retired">{t("lifecycles.retired")}</option>
                    </select>
                </div>
                <div>
                    <Label htmlFor="asset-sort">{t("sort")}</Label>
                    <select
                        id="asset-sort"
                        name="sort"
                        defaultValue={query.sort ?? "name_asc"}
                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                    >
                        <option value="name_asc">{t("sorts.name_asc")}</option>
                        <option value="name_desc">{t("sorts.name_desc")}</option>
                        <option value="updated_desc">{t("sorts.updated_desc")}</option>
                    </select>
                </div>
                <div>
                    <Label htmlFor="asset-manufacturer-filter">{t("manufacturer")}</Label>
                    <Input
                        id="asset-manufacturer-filter"
                        name="manufacturer"
                        defaultValue={query.manufacturer ?? ""}
                        maxLength={100}
                    />
                </div>
                <div>
                    <Label htmlFor="asset-model-filter">{t("model")}</Label>
                    <Input
                        id="asset-model-filter"
                        name="model"
                        defaultValue={query.model ?? ""}
                        maxLength={100}
                    />
                </div>
                <div>
                    <Label htmlFor="asset-classification-filter">{t("classification")}</Label>
                    <Input
                        id="asset-classification-filter"
                        name="classification"
                        defaultValue={query.classification ?? ""}
                        maxLength={100}
                    />
                </div>
                <div className="flex gap-3 sm:col-span-4">
                    <Button type="submit">{t("applyFilters")}</Button>
                    <Link
                        className="inline-flex h-10 items-center rounded-control px-3 text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                        href={`/${locale}/app/assets`}
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
                        action="/auth/asset-management"
                        method="post"
                        className="mt-5 grid gap-4 sm:grid-cols-2"
                    >
                        <input type="hidden" name="intent" value="create" />
                        <input type="hidden" name="locale" value={locale} />
                        <div>
                            <Label htmlFor="create-asset-name">{t("displayName")}</Label>
                            <Input
                                id="create-asset-name"
                                name="displayName"
                                required
                                maxLength={200}
                            />
                        </div>
                        <div>
                            <Label htmlFor="create-asset-classification">
                                {t("classification")}
                            </Label>
                            <Input
                                id="create-asset-classification"
                                name="classification"
                                maxLength={120}
                            />
                        </div>
                        <div>
                            <Label htmlFor="create-asset-manufacturer">{t("manufacturer")}</Label>
                            <Input
                                id="create-asset-manufacturer"
                                name="manufacturer"
                                maxLength={200}
                            />
                        </div>
                        <div>
                            <Label htmlFor="create-asset-model">{t("model")}</Label>
                            <Input id="create-asset-model" name="model" maxLength={200} />
                        </div>
                        <div className="sm:col-span-2">
                            <Label htmlFor="create-asset-description">
                                {t("descriptionField")}
                            </Label>
                            <textarea
                                id="create-asset-description"
                                name="description"
                                rows={3}
                                maxLength={10000}
                                className="mt-2 w-full rounded-control border border-border bg-surface px-3 py-2"
                            />
                        </div>
                        <p className="text-sm text-muted-foreground sm:col-span-2">
                            {t("create.identifierHint")}
                        </p>
                        <div>
                            <Label htmlFor="create-asset-identifier-type">
                                {t("identifiers.type")}
                            </Label>
                            <Input
                                id="create-asset-identifier-type"
                                name="identifierType"
                                maxLength={64}
                            />
                        </div>
                        <div>
                            <Label htmlFor="create-asset-identifier-value">
                                {t("identifiers.value")}
                            </Label>
                            <Input
                                id="create-asset-identifier-value"
                                name="identifierValue"
                                maxLength={255}
                            />
                        </div>
                        <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
                            {t("create.submit")}
                        </Button>
                    </form>
                </details>
            ) : null}

            <section
                className="rounded-card border border-border bg-surface p-5"
                aria-labelledby="asset-results-heading"
            >
                <h2 id="asset-results-heading" className="font-display text-xl font-semibold">
                    {t("list.title")}
                </h2>
                {result.data.length === 0 ? (
                    <p className="mt-4 text-muted-foreground">
                        {filtered ? t("list.noResults") : t("list.empty")}
                    </p>
                ) : (
                    <ul className="mt-4 divide-y divide-border">
                        {result.data.map((asset) => (
                            <li
                                key={asset.id}
                                className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div>
                                    <Link
                                        className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                                        href={`/${locale}/app/assets/${asset.id}`}
                                    >
                                        {asset.displayName}
                                    </Link>
                                    <p className="text-sm text-muted-foreground">
                                        {t(`lifecycles.${asset.lifecycle}`)} ·{" "}
                                        {t(`statuses.${asset.status}`)}
                                    </p>
                                </div>
                                <Link
                                    className="text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                                    href={`/${locale}/app/assets/${asset.id}`}
                                >
                                    {t("list.view")}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
                {result.nextCursor ? (
                    <Link
                        className="mt-5 inline-flex text-sm font-medium text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                        href={`/${locale}/app/assets?${nextParams.toString()}`}
                    >
                        {t("list.next")}
                    </Link>
                ) : null}
            </section>
        </div>
    );
}
