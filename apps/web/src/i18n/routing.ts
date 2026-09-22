import { defineRouting } from "next-intl/routing";

import { getTechnicalFallbackLocale, locales } from "./locales";

export const routing = defineRouting({
    locales,
    defaultLocale: getTechnicalFallbackLocale(),
    localePrefix: "always",
});
