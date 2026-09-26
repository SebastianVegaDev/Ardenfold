import { describe, expect, it } from "vitest";

import { formatQuoteDecimal, formatQuoteMoney } from "./revisions/quote-format";

describe("exact quotation presentation", () => {
    it("keeps large and fractional server amounts exact in English and Spanish", () => {
        expect(formatQuoteMoney("123456789012345678.90", "PEN", 2, "en")).toContain(
            "123,456,789,012,345,678.90",
        );
        expect(formatQuoteMoney("123456789012345678.90", "PEN", 2, "es")).toContain(
            "123,456,789,012,345,678.90",
        );
        expect(formatQuoteMoney("-0.25", "USD", 2, "en")).toBe("-$0.25");
        expect(formatQuoteMoney("1234", "JPY", 0, "en")).not.toContain(".00");
        expect(formatQuoteMoney("1.234", "KWD", 3, "en")).toContain("1.234");
        expect(formatQuoteDecimal("123456789012.000001", "es")).toContain("123,456,789,012.000001");
    });

    it("rejects values with more precision than the authoritative currency scale", () => {
        expect(() => formatQuoteMoney("1.234", "PEN", 2, "en")).toThrow(
            "Invalid monetary precision",
        );
    });
});
