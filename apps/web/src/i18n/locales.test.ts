import { describe, expect, it } from "vitest";

import { getTechnicalFallbackLocale, resolveLocale } from "./locales";

describe("locale resolution", () => {
    it("uses preferences in the product-defined priority order", () => {
        expect(
            resolveLocale(
                {
                    userLocale: "es",
                    organizationLocale: "en",
                    cookieLocale: "en",
                    browserLocales: ["en-US"],
                },
                "en",
            ),
        ).toEqual({ locale: "es", source: "user" });

        expect(
            resolveLocale(
                {
                    organizationLocale: "es-PE",
                    cookieLocale: "en",
                },
                "en",
            ),
        ).toEqual({ locale: "es", source: "organization" });
    });

    it("uses cookie, browser, then the technical fallback for unknown values", () => {
        expect(resolveLocale({ cookieLocale: "es" }, "en")).toEqual({
            locale: "es",
            source: "cookie",
        });
        expect(resolveLocale({ browserLocales: ["es-MX"] }, "en")).toEqual({
            locale: "es",
            source: "browser",
        });
        expect(resolveLocale({ browserLocales: ["pt-BR"] }, "en")).toEqual({
            locale: "en",
            source: "fallback",
        });
    });

    it("uses the configured technical fallback in non-production environments", () => {
        expect(getTechnicalFallbackLocale("es")).toBe("es");
    });
});
