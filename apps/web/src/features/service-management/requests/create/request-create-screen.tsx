import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";

import { RequestEditor } from "../forms/request-editor";

export async function RequestCreateScreen({ locale }: Readonly<{ locale: Locale }>) {
    const t = await getTranslations("serviceRequests");
    const context = await getActiveOrganizationSession();
    const active = await getActiveOrganization(
        context.session.accessToken,
        context.organization.id,
    );
    const allowed =
        active.permissions.includes("service_requests.write") &&
        active.permissions.includes("parties.read");
    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
            <Link className="text-primary underline" href={`/${locale}/app/service-requests`}>
                {t("back")}
            </Link>
            <header>
                <h1 className="font-display text-3xl font-semibold">{t("newRequest")}</h1>
                <p className="mt-2 text-muted-foreground">{t("createDescription")}</p>
            </header>
            {allowed ? (
                <RequestEditor
                    locale={locale}
                    canReadAssets={active.permissions.includes("assets.read")}
                />
            ) : (
                <p role="alert">{t("forbidden")}</p>
            )}
        </div>
    );
}
