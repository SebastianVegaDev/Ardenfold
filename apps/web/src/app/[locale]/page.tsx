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
        <main className="grid min-h-screen place-items-center bg-neutral-950 p-6 text-neutral-50">
            <div className="max-w-lg text-center">
                <h1 className="text-4xl font-semibold tracking-tight">{translate("title")}</h1>
                <p className="mt-3 text-neutral-300">{translate("description")}</p>
            </div>
        </main>
    );
}
