import { getTranslations } from "next-intl/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { getAuthenticatedUser } from "@/auth/api-client";
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
    const identity = await getAuthenticatedUser(session.accessToken);

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
                account: translate("account"),
                signOut: translate("signOut"),
            }}
            accountName={identity.user.displayName ?? identity.user.email}
            homeHref={`/${locale}/app`}
            signOutHref={`/auth/sign-out?locale=${locale}`}
        >
            {children}
        </AppShell>
    );
}
