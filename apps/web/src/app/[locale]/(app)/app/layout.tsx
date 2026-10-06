import { getTranslations } from "next-intl/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import {
    getAccessibleOrganizations,
    getActiveOrganization,
    getAuthenticatedUser,
} from "@/auth/api-client";
import { activeOrganizationCookie, resolveActiveOrganization } from "@/auth/organization-context";
import type { Locale } from "@/i18n/locales";

type AuthenticatedLayoutProps = Readonly<{
    children: ReactNode;
    params: Promise<{
        locale: Locale;
    }>;
}>;

export default async function AuthenticatedLayout({ children, params }: AuthenticatedLayoutProps) {
    const [{ locale }, session, translate] = await Promise.all([
        params,
        withAuth({ ensureSignedIn: true }),
        getTranslations("shell"),
    ]);
    const [identity, organizations, cookieStore] = await Promise.all([
        getAuthenticatedUser(session.accessToken),
        getAccessibleOrganizations(session.accessToken),
        cookies(),
    ]);
    const selectedOrganization = resolveActiveOrganization(
        organizations.data,
        cookieStore.get(activeOrganizationCookie)?.value,
    );
    const activeOrganization = selectedOrganization
        ? await getActiveOrganization(session.accessToken, selectedOrganization.id)
        : undefined;

    return (
        <AppShell
            copy={{
                brandAlt: translate("brandAlt"),
                skipToContent: translate("skipToContent"),
                openNavigation: translate("openNavigation"),
                closeNavigation: translate("closeNavigation"),
                primaryNavigation: translate("primaryNavigation"),
                home: translate("home"),
                parties: translate("parties"),
                assets: translate("assets"),
                serviceRequests: translate("serviceRequests"),
                quotations: translate("quotations"),
                workOrders: translate("workOrders"),
                operations: translate("operations"),
                technicalOperations: translate("technicalOperations"),
                settings: translate("settings"),
                organization: translate("organization"),
                organizationPlaceholder: translate("organizationPlaceholder"),
                noOrganizations: translate("noOrganizations"),
                account: translate("account"),
                signOut: translate("signOut"),
            }}
            accountName={identity.user.displayName ?? identity.user.email}
            activeOrganizationId={activeOrganization?.id}
            homeHref={`/${locale}/app`}
            partiesHref={`/${locale}/app/parties`}
            canReadParties={activeOrganization?.permissions.includes("parties.read") ?? false}
            assetsHref={`/${locale}/app/assets`}
            canReadAssets={activeOrganization?.permissions.includes("assets.read") ?? false}
            serviceRequestsHref={`/${locale}/app/service-requests`}
            canReadServiceRequests={
                activeOrganization?.permissions.includes("service_requests.read") ?? false
            }
            quotationsHref={`/${locale}/app/quotations`}
            canReadQuotations={activeOrganization?.permissions.includes("quotations.read") ?? false}
            workOrdersHref={`/${locale}/app/work-orders`}
            canReadWorkOrders={
                activeOrganization?.permissions.includes("work_orders.read") ?? false
            }
            operationsHref={`/${locale}/app/operations`}
            technicalOperationsHref={`/${locale}/app/technical-operations`}
            canReadTechnicalOperations={
                activeOrganization?.permissions.includes("technical_executions.read") ?? false
            }
            canReadOperations={(
                [
                    "service_requests.read",
                    "quotations.read",
                    "work_orders.read",
                    "receipts.read",
                    "parties.read",
                    "assets.read",
                ] as const
            ).every((permission) => activeOrganization?.permissions.includes(permission) ?? false)}
            locale={locale}
            onboardingHref={`/${locale}/app/onboarding`}
            organizations={organizations.data}
            settingsHref={`/${locale}/app/settings/organization`}
            signOutHref={`/auth/sign-out?locale=${locale}`}
        >
            {children}
        </AppShell>
    );
}
