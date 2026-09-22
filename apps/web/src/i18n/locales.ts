export const locales = ["en", "es"] as const;

export type Locale = (typeof locales)[number];

export type LocaleResolutionSource = "user" | "organization" | "cookie" | "browser" | "fallback";

export type LocaleResolution = Readonly<{
    locale: Locale;
    source: LocaleResolutionSource;
}>;

export type LocalePreferences = Readonly<{
    userLocale?: string | null;
    organizationLocale?: string | null;
    cookieLocale?: string | null;
    browserLocales?: readonly string[];
}>;

export const formattingLocales: Readonly<Record<Locale, string>> = {
    en: "en-US",
    es: "es-PE",
};

export function isLocale(value: string | null | undefined): value is Locale {
    return value !== undefined && value !== null && locales.includes(value as Locale);
}

function toSupportedLocale(value: string | null | undefined): Locale | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();

    if (isLocale(normalized)) {
        return normalized;
    }

    return locales.find((locale) => normalized.startsWith(`${locale}-`));
}

export function getTechnicalFallbackLocale(
    value = process.env.NEXT_PUBLIC_ARDENFOLD_FALLBACK_LOCALE,
): Locale {
    const locale = toSupportedLocale(value);

    if (locale !== undefined) {
        return locale;
    }

    // This default keeps local and CI builds deterministic. Deployments can
    // configure the technical fallback without thereby defining a commercial
    // or product-primary language.
    return "en";
}

export function resolveLocale(
    preferences: LocalePreferences,
    fallbackLocale = getTechnicalFallbackLocale(),
): LocaleResolution {
    const candidates: readonly [LocaleResolutionSource, string | null | undefined][] = [
        ["user", preferences.userLocale],
        ["organization", preferences.organizationLocale],
        ["cookie", preferences.cookieLocale],
    ];

    for (const [source, candidate] of candidates) {
        const locale = toSupportedLocale(candidate);

        if (locale !== undefined) {
            return { locale, source };
        }
    }

    for (const browserLocale of preferences.browserLocales ?? []) {
        const locale = toSupportedLocale(browserLocale);

        if (locale !== undefined) {
            return { locale, source: "browser" };
        }
    }

    return { locale: fallbackLocale, source: "fallback" };
}
