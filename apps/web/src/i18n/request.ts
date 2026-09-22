import { getRequestConfig } from "next-intl/server";

import { hasLocale } from "next-intl";

import english from "./messages/en.json";
import spanish from "./messages/es.json";
import { routing } from "./routing";

const messages = {
    en: english,
    es: spanish,
} as const;

export default getRequestConfig(async ({ requestLocale }) => {
    const requestedLocale = await requestLocale;
    const locale = hasLocale(routing.locales, requestedLocale)
        ? requestedLocale
        : routing.defaultLocale;

    return {
        locale,
        messages: messages[locale],
    };
});
