import { identifierSchema } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { listAvailableSites } from "@/features/assets/api-client";
import { getQuote, QuoteApiError } from "@/features/service-management/quotations/api/quote-api";
import { getServiceRequest } from "@/features/service-management/requests/api/request-api";
import type { Locale } from "@/i18n/locales";

import { WorkOrderCreateForm } from "./work-order-create-form";

export async function WorkOrderCreateScreen({
    locale,
    quoteId,
}: Readonly<{ locale: Locale; quoteId: string }>) {
    if (!identifierSchema.safeParse(quoteId).success) notFound();
    const t = await getTranslations("workOrders");
    const { session, organization } = await getActiveOrganizationSession();
    const active = await getActiveOrganization(session.accessToken, organization.id);
    const required = [
        "work_orders.write",
        "work_orders.read",
        "quotations.read",
        "service_requests.read",
        "parties.read",
        "sites.read",
    ] as const;
    if (!required.every((permission) => active.permissions.includes(permission)))
        return (
            <p role="alert" className="mx-auto max-w-5xl p-6">
                {t("forbidden")}
            </p>
        );
    let quote;
    try {
        quote = await getQuote(session.accessToken, organization.id, quoteId);
    } catch (error) {
        if (error instanceof QuoteApiError && error.status === 404) notFound();
        return (
            <p role="alert" className="mx-auto max-w-5xl p-6">
                {t("loadError")}
            </p>
        );
    }
    let data;
    try {
        data = await Promise.all([
            getServiceRequest(session.accessToken, organization.id, quote.requestId),
            listAvailableSites(session.accessToken, organization.id),
        ]);
    } catch {
        return (
            <p role="alert" className="mx-auto max-w-5xl p-6">
                {t("loadError")}
            </p>
        );
    }
    const [request, sites] = data;
    const acceptance = quote.acceptances.find((item) => item.id === quote.activeAcceptanceId);
    const revision = quote.revisions.find((item) => item.id === acceptance?.revisionId);
    const eligible =
        quote.status === "accepted" &&
        request.status === "active" &&
        acceptance &&
        !acceptance.withdrawnAt &&
        revision?.status === "accepted" &&
        revision.lines.length > 0 &&
        (active.permissions.includes("assets.read") ||
            revision.lines.every((line) => !line.assetId));
    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
            <Link className="text-primary underline" href={`/${locale}/app/quotations/${quote.id}`}>
                {t("backToQuote")}
            </Link>
            <header>
                <h1 className="font-display text-3xl font-semibold">{t("newOrder")}</h1>
                <p className="mt-2 text-muted-foreground">
                    {quote.reference} · {request.summary}
                </p>
            </header>
            {eligible && revision ? (
                <WorkOrderCreateForm
                    locale={locale}
                    quote={quote}
                    request={request}
                    revision={revision}
                    acceptanceId={acceptance.id}
                    sites={sites.data.filter((site) => site.isActive)}
                    canReadAssets={active.permissions.includes("assets.read")}
                />
            ) : (
                <p role="alert">{t("basisUnavailable")}</p>
            )}
        </div>
    );
}
