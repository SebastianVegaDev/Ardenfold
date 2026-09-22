import type { Locale } from "./locales";

import { formattingLocales } from "./locales";

export type RegionalPreferences = Readonly<{
    language: Locale;
    formattingLocale: string;
    timeZone: string;
}>;

function intlLocale(preferences: RegionalPreferences): string {
    return preferences.formattingLocale || formattingLocales[preferences.language];
}

export function formatDate(value: Date | number, preferences: RegionalPreferences): string {
    return new Intl.DateTimeFormat(intlLocale(preferences), {
        dateStyle: "medium",
        timeZone: preferences.timeZone,
    }).format(value);
}

export function formatTime(value: Date | number, preferences: RegionalPreferences): string {
    return new Intl.DateTimeFormat(intlLocale(preferences), {
        timeStyle: "short",
        timeZone: preferences.timeZone,
    }).format(value);
}

export function formatNumber(value: number, preferences: RegionalPreferences): string {
    return new Intl.NumberFormat(intlLocale(preferences)).format(value);
}

export function formatCurrency(
    value: number,
    currency: string,
    preferences: RegionalPreferences,
): string {
    return new Intl.NumberFormat(intlLocale(preferences), {
        style: "currency",
        currency,
    }).format(value);
}

export function formatList(values: readonly string[], preferences: RegionalPreferences): string {
    return new Intl.ListFormat(intlLocale(preferences), {
        style: "long",
        type: "conjunction",
    }).format(values);
}
