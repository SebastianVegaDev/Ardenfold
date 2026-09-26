import { identifierSchema } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import {
    getServiceRequest,
    ServiceRequestApiError,
} from "@/features/service-management/requests/api/request-api";
import type { Locale } from "@/i18n/locales";

import { QuoteEditor } from "../editor/quote-editor";

export async function QuoteCreateScreen({
    locale,
    requestId,
}: Readonly<{ locale: Locale; requestId: string }>) {
    if (!identifierSchema.safeParse(requestId).success) notFound();
    const t = await getTranslations("quotations");
    const { session, organization } = await getActiveOrganizationSession();
    const active = await getActiveOrganization(session.accessToken, organization.id);
    const allowed = (
        ["quotations.write", "service_requests.read", "parties.read", "assets.read"] as const
    ).every((permission) => active.permissions.includes(permission));
    if (!allowed)
        return (
            <div className="mx-auto max-w-4xl p-6 sm:p-8">
                <h1>{t("newQuote")}</h1>
                <p role="alert">{t("forbidden")}</p>
            </div>
        );
    let request;
    try {
        request = await getServiceRequest(session.accessToken, organization.id, requestId);
    } catch (error) {
        if (error instanceof ServiceRequestApiError && error.status === 404) notFound();
        return (
            <div className="mx-auto max-w-4xl p-6 sm:p-8">
                <h1>{t("newQuote")}</h1>
                <p role="alert">{t("loadError")}</p>
            </div>
        );
    }
    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
            <Link
                className="text-primary underline"
                href={`/${locale}/app/service-requests/${requestId}`}
            >
                {t("backToRequest")}
            </Link>
            <header>
                <h1 className="font-display text-3xl font-semibold">{t("newQuote")}</h1>
                <p className="mt-2 text-muted-foreground">{request.summary}</p>
            </header>
            {request.status === "active" ? (
                <QuoteEditor locale={locale} request={request} />
            ) : (
                <p role="alert">{t("requestNotEligible")}</p>
            )}
        </div>
    );
}
