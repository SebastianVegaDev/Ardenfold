import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@ardenfold/ui";
import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import type { Locale } from "@/i18n/locales";

type HomePageProps = Readonly<{
    params: Promise<{
        locale: Locale;
    }>;
}>;

export default async function HomePage({ params }: HomePageProps) {
    const { locale } = await params;

    setRequestLocale(locale);
    const translate = await getTranslations("home");

    return (
        <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
            <div className="max-w-lg text-center">
                <BrandLogo alt={translate("logoAlt")} className="mx-auto h-auto w-60" />
                <h1 className="font-display text-4xl font-semibold tracking-tight">
                    {translate("title")}
                </h1>
                <p className="mt-3 text-muted-foreground">{translate("description")}</p>
                <Button asChild className="mt-8" size="lg">
                    <Link href={`/${locale}/sign-in`}>{translate("signIn")}</Link>
                </Button>
            </div>
        </main>
    );
}
