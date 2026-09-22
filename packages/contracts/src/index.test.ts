import { describe, expect, it } from "vitest";

import { dateOnlySchema, decimalSchema, instantSchema, paginationQuerySchema } from "./index";

describe("wire contracts", () => {
    it("preserves decimal precision and trailing zeroes", () => {
        expect(decimalSchema.parse("12345678901234567890.00100")).toBe(
            "12345678901234567890.00100",
        );

        expect(decimalSchema.safeParse(1.25).success).toBe(false);
        expect(decimalSchema.safeParse("1,25").success).toBe(false);
        expect(decimalSchema.safeParse("1e3").success).toBe(false);
    });

    it("separates UTC instants from calendar dates", () => {
        expect(instantSchema.safeParse("2026-09-22T10:00:00.000Z").success).toBe(true);

        expect(instantSchema.safeParse("2026-09-22T10:00:00").success).toBe(false);

        expect(dateOnlySchema.safeParse("2026-02-30").success).toBe(false);
    });

    it("parses pagination with bounded defaults", () => {
        expect(paginationQuerySchema.parse({})).toEqual({
            page: 1,
            limit: 25,
        });

        expect(
            paginationQuerySchema.parse({
                page: "2",
                limit: "50",
            }),
        ).toEqual({
            page: 2,
            limit: 50,
        });
    });

    it.each([
        { page: "0" },
        { limit: "101" },
        { page: "1.5" },
        { limit: ["1", "2"] },
        { unknown: "x" },
    ])("rejects invalid pagination: %j", (input) => {
        expect(paginationQuerySchema.safeParse(input).success).toBe(false);
    });
});
