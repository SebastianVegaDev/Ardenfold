import { identifierSchema } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { formatDate, formatTime } from "@/i18n/formatters";
import type { Locale } from "@/i18n/locales";
import { formattingLocales } from "@/i18n/locales";

import {
    getCustomer,
    getKnownAsset,
    getServiceRequest,
    ServiceRequestApiError,
} from "../api/request-api";
import { RequestEditor } from "../forms/request-editor";
import { RequestActions } from "../lifecycle/request-actions";

type Props = Readonly<{
    locale: Locale;
    requestId: string;
    edit?: boolean;
    notice?: string | undefined;
}>;

export async function RequestDetailScreen({ locale, requestId, edit = false, notice }: Props) {
    if (!identifierSchema.safeParse(requestId).success) notFound();
    const t = await getTranslations("serviceRequests");
    const context = await getActiveOrganizationSession();
    const active = await getActiveOrganization(
        context.session.accessToken,
        context.organization.id,
    );
    if (!active.permissions.includes("service_requests.read")) {
        return (
            <div className="mx-auto max-w-4xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {t("forbidden")}
                </p>
            </div>
        );
    }
    let detail;
    try {
        detail = await getServiceRequest(
            context.session.accessToken,
            context.organization.id,
            requestId,
        );
    } catch (error) {
        if (error instanceof ServiceRequestApiError && error.status === 404) notFound();
        return (
            <div className="mx-auto max-w-4xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {error instanceof ServiceRequestApiError && error.status === 403
                        ? t("forbidden")
                        : t("loadError")}
                </p>
            </div>
        );
    }
    const canEdit =
        detail.status === "active" &&
        active.permissions.includes("service_requests.write") &&
        active.permissions.includes("parties.read");
    if (edit && !canEdit) {
        return (
            <div className="mx-auto max-w-4xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("editRequest")}</h1>
                <p role="alert" className="mt-4">
                    {detail.status === "active" ? t("forbidden") : t("terminalError")}
                </p>
            </div>
        );
    }
    const customer = active.permissions.includes("parties.read")
        ? await getCustomer(
              context.session.accessToken,
              context.organization.id,
              detail.customerPartyId,
          ).catch(() => null)
        : null;
    const assetNames: Record<string, string> = {};
    if (active.permissions.includes("assets.read")) {
        await Promise.all(
            [
                ...new Set(
                    detail.scopeItems.flatMap((item) => (item.assetId ? [item.assetId] : [])),
                ),
            ].map(async (id) => {
                try {
                    assetNames[id] = (
                        await getKnownAsset(
                            context.session.accessToken,
                            context.organization.id,
                            id,
                        )
                    ).displayName;
                } catch {
                    assetNames[id] = id;
                }
            }),
        );
    }
    const preferences = {
        language: locale,
        formattingLocale: formattingLocales[locale],
        timeZone: active.defaultTimeZone,
    };
    const dateTime = (value: string) =>
        `${formatDate(new Date(value), preferences)} ${formatTime(new Date(value), preferences)}`;
    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
            <Link className="text-primary underline" href={`/${locale}/app/service-requests`}>
                {t("back")}
            </Link>
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="font-display text-3xl font-semibold">
                        {edit ? t("editRequest") : detail.summary}
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                        {t(`statuses.${detail.status}`)} ·{" "}
                        {t("version", { version: detail.version })}
                    </p>
                </div>
                {canEdit && !edit ? (
                    <Link
                        className="inline-flex h-10 items-center rounded-control bg-primary px-4 text-primary-foreground"
                        href={`/${locale}/app/service-requests/${detail.id}/edit`}
                    >
                        {t("editRequest")}
                    </Link>
                ) : null}
            </header>
            {notice === "success" ? (
                <p role="status" className="rounded-control border border-border bg-surface p-3">
                    {t("saved")}
                </p>
            ) : null}
            {edit ? (
                <RequestEditor
                    locale={locale}
                    initial={detail}
                    initialCustomer={customer}
                    assetNames={assetNames}
                    canReadAssets={active.permissions.includes("assets.read")}
                />
            ) : (
                <>
                    <section
                        className="rounded-card border border-border bg-surface p-5"
                        aria-labelledby="request-detail-heading"
                    >
                        <h2
                            id="request-detail-heading"
                            className="font-display text-xl font-semibold"
                        >
                            {t("requestDetails")}
                        </h2>
                        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div>
                                <dt className="text-sm text-muted-foreground">{t("customer")}</dt>
                                <dd>{customer?.displayName ?? detail.customerPartyId}</dd>
                            </div>
                            <div>
                                <dt className="text-sm text-muted-foreground">{t("contact")}</dt>
                                <dd>
                                    {customer?.contacts.find(
                                        (contact) => contact.id === detail.requesterContactId,
                                    )?.displayName ??
                                        detail.requesterName ??
                                        t("notProvided")}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-sm text-muted-foreground">{t("createdAt")}</dt>
                                <dd>{dateTime(detail.createdAt)}</dd>
                            </div>
                            <div>
                                <dt className="text-sm text-muted-foreground">{t("updatedAt")}</dt>
                                <dd>{dateTime(detail.updatedAt)}</dd>
                            </div>
                            {detail.terminalAt ? (
                                <div>
                                    <dt className="text-sm text-muted-foreground">
                                        {t("terminalAt")}
                                    </dt>
                                    <dd>{dateTime(detail.terminalAt)}</dd>
                                </div>
                            ) : null}
                            {detail.terminalReason ? (
                                <div>
                                    <dt className="text-sm text-muted-foreground">
                                        {t("transitionReason")}
                                    </dt>
                                    <dd className="whitespace-pre-wrap">{detail.terminalReason}</dd>
                                </div>
                            ) : null}
                        </dl>
                        <h3 className="mt-6 font-semibold">{t("customerContext")}</h3>
                        <p className="mt-2 whitespace-pre-wrap">
                            {detail.customerContext ?? t("notProvided")}
                        </p>
                    </section>
                    <section
                        className="rounded-card border border-border bg-surface p-5"
                        aria-labelledby="request-scope-detail-heading"
                    >
                        <h2
                            id="request-scope-detail-heading"
                            className="font-display text-xl font-semibold"
                        >
                            {t("scopeSection")}
                        </h2>
                        {detail.scopeItems.length ? (
                            <ol className="mt-4 list-decimal space-y-4 pl-6">
                                {detail.scopeItems.map((item) => (
                                    <li key={item.id}>
                                        <p className="font-medium whitespace-pre-wrap">
                                            {item.description}
                                        </p>
                                        {item.assetId ? (
                                            <p className="text-sm text-muted-foreground">
                                                {t("knownAsset")}:{" "}
                                                {assetNames[item.assetId] ?? item.assetId}
                                            </p>
                                        ) : null}
                                        {item.unidentifiedAssetDescription ? (
                                            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                                                {t("unidentifiedAsset")}:{" "}
                                                {item.unidentifiedAssetDescription}
                                            </p>
                                        ) : null}
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="mt-3 text-muted-foreground">{t("noScope")}</p>
                        )}
                    </section>
                    {detail.status === "active" &&
                    active.permissions.includes("service_requests.write") ? (
                        <RequestActions requestId={detail.id} version={detail.version} />
                    ) : null}
                </>
            )}
        </div>
    );
}
