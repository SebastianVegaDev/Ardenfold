import { getTranslations, setRequestLocale } from "next-intl/server";

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
                <picture>
                    <source
                        media="(prefers-color-scheme: dark)"
                        srcSet="/brand/logo-primary-dark.svg"
                    />
                    <img
                        alt={translate("logoAlt")}
                        className="mx-auto h-auto w-60"
                        height="180"
                        src="/brand/logo-primary-light.svg"
                        width="720"
                    />
                </picture>
                <h1 className="font-display text-4xl font-semibold tracking-tight">
                    {translate("title")}
                </h1>
                <p className="mt-3 text-muted-foreground">{translate("description")}</p>
            </div>
        </main>
    );
}
