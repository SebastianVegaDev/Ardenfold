import { getTranslations } from "next-intl/server";

import { getActiveOrganization, getAuthenticatedUser } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { listAvailableSites } from "@/features/assets/api-client";
import { ExecutionWorkspace } from "@/features/technical-operations/executions/details/execution-workspace";
import { getTechnicalContext } from "@/features/technical-operations/api/technical-context";
import type { Locale } from "@/i18n/locales";

export default async function TechnicalExecutionPage({
    params,
}: {
    params: Promise<{ locale: Locale; executionId: string }>;
}) {
    const { locale, executionId } = await params;
    const t = await getTranslations("technicalOperations");
    const { session, organization } = await getActiveOrganizationSession();
    const [active, identity] = await Promise.all([
        getActiveOrganization(session.accessToken, organization.id),
        getAuthenticatedUser(session.accessToken),
    ]);
    if (!active.permissions.includes("technical_executions.read"))
        return (
            <p role="alert" className="p-6">
                {t("forbidden")}
            </p>
        );
    const context = await getTechnicalContext(
        session.accessToken,
        organization.id,
        executionId,
    ).catch(() => null);
    const sites = await listAvailableSites(session.accessToken, organization.id)
        .then((response) => response.data)
        .catch(() => []);
    return (
        <ExecutionWorkspace
            id={executionId}
            locale={locale}
            currentUserId={identity.user.id}
            canWrite={active.permissions.includes("technical_executions.write")}
            canReadEvidence={active.permissions.includes("technical_evidence.read")}
            canUpload={active.permissions.includes("files.upload")}
            canDownload={active.permissions.includes("files.read")}
            context={context}
            sites={sites}
        />
    );
}
