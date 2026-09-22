import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import type { Locale } from "@/i18n/locales";

type AuthenticatedLayoutProps = Readonly<{
    children: ReactNode;
    params: Promise<{
        locale: Locale;
    }>;
}>;

export default async function AuthenticatedLayout({ children, params }: AuthenticatedLayoutProps) {
    const { locale } = await params;
    const translate = await getTranslations("shell");

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
                accountPlaceholder: translate("accountPlaceholder"),
            }}
            homeHref={`/${locale}/app`}
        >
            {children}
        </AppShell>
    );
}
