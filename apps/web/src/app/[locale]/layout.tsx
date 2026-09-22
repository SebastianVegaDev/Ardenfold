import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Manrope } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { routing } from "@/i18n/routing";

import "../globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

const manrope = Manrope({
    subsets: ["latin"],
    variable: "--font-manrope",
    display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    variable: "--font-ibm-plex-mono",
    display: "swap",
});

type LocaleLayoutProps = Readonly<{
    children: ReactNode;
    params: Promise<{
        locale: string;
    }>;
}>;

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
    const { locale } = await params;

    if (!hasLocale(routing.locales, locale)) {
        return {};
    }

    const translate = await getTranslations({ locale, namespace: "metadata" });

    return {
        title: "Ardenfold",
        description: translate("defaultDescription"),
    };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
    const { locale } = await params;

    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }

    setRequestLocale(locale);
    const messages = await getMessages();

    return (
        <html lang={locale}>
            <body className={`${inter.variable} ${manrope.variable} ${ibmPlexMono.variable}`}>
                <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
            </body>
        </html>
    );
}
