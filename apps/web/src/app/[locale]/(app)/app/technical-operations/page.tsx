import { technicalQueueKindSchema } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { TechnicalQueueScreen } from "@/features/technical-operations/executions/list/technical-queue-screen";
import type { Locale } from "@/i18n/locales";

export default async function TechnicalOperationsPage({
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
    return (
        <TechnicalQueueScreen
            locale={locale}
            canWrite={active.permissions.includes("technical_executions.write")}
            copy={{
                title: t("title"),
                description: t("description"),
                loading: t("loading"),
                empty: t("empty"),
                retry: t("retry"),
                next: t("next"),
                start: t("start"),
                open: t("open"),
                allExecutions: t("allExecutions"),
                conflict: t("conflict"),
                error: t("error"),
                forbidden: t("forbidden"),
                workOrder: t("workOrder"),
                workItem: t("workItem"),
                asset: t("asset"),
                queue: Object.fromEntries(
                    technicalQueueKindSchema.options.map((kind) => [kind, t(`queue.${kind}`)]),
                ),
            }}
        />
    );
}
