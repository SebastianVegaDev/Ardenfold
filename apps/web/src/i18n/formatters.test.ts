import { describe, expect, it } from "vitest";

import { formatCurrency, formatDate, formatList, formatNumber, formatTime } from "./formatters";

const preferences = {
    language: "es" as const,
    formattingLocale: "es-PE",
    timeZone: "America/Lima",
};

describe("regional formatters", () => {
    it("formats dates, times, numbers, currencies and lists independently from language", () => {
        const instant = new Date("2026-09-22T14:30:00.000Z");

        expect(formatDate(instant, preferences)).toMatch(/22/);
        expect(formatTime(instant, preferences)).toMatch(/9:30/);
        expect(formatNumber(12_345.67, preferences)).toBe("12,345.67");
        expect(formatCurrency(12.5, "PEN", preferences)).toContain("12.50");
        expect(formatList(["a", "b", "c"], preferences)).toContain(" y ");
    });
});
