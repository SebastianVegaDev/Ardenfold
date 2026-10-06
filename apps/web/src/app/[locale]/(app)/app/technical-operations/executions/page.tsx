import { getTranslations } from "next-intl/server";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { ExecutionListScreen } from "@/features/technical-operations/executions/list/execution-list-screen";
import type { Locale } from "@/i18n/locales";

export default async function TechnicalExecutionListPage({
    params,
}: {
    params: Promise<{ locale: Locale }>;
}) {
    const { locale } = await params;
    const t = await getTranslations("technicalOperations");
    const { session, organization } = await getActiveOrganizationSession();
    const active = await getActiveOrganization(session.accessToken, organization.id);
    if (!active.permissions.includes("technical_executions.read"))
        return (
            <p role="alert" className="p-6">
                {t("forbidden")}
            </p>
        );
    const keys = [
        "back",
        "allExecutions",
        "status",
        "allStatuses",
        "active",
        "abandoned",
        "revision",
        "open",
        "next",
        "error",
        "retry",
        "loading",
        "empty",
    ] as const;
    return (
        <ExecutionListScreen
            locale={locale}
            copy={Object.fromEntries(keys.map((key) => [key, t(key)]))}
        />
    );
}
