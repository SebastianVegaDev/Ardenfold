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
                organization: translate("organization"),
                organizationPlaceholder: translate("organizationPlaceholder"),
                noOrganizations: translate("noOrganizations"),
                account: translate("account"),
                signOut: translate("signOut"),
            }}
            accountName={identity.user.displayName ?? identity.user.email}
            activeOrganizationId={activeOrganization?.id}
            homeHref={`/${locale}/app`}
            locale={locale}
            organizations={organizations.data}
            signOutHref={`/auth/sign-out?locale=${locale}`}
        >
            {children}
        </AppShell>
    );
}
