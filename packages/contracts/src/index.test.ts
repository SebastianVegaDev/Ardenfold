import { describe, expect, it } from "vitest";

import {
    addAssetIdentifierRequestSchema,
    assetListQuerySchema,
    createAssetRequestSchema,
    dateOnlySchema,
    decimalSchema,
    instantSchema,
    paginationQuerySchema,
    setAssetLifecycleRequestSchema,
    updateAssetRequestSchema,
} from "./index";

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

    it("keeps asset identifiers typed without requiring global uniqueness", () => {
        const parsed = createAssetRequestSchema.parse({
            displayName: "  Field meter  ",
            identifiers: [
                { type: "serial_number", originalValue: "SN-42" },
                { type: "customer_code", originalValue: "C-42" },
            ],
        });
        expect(parsed.displayName).toBe("Field meter");
        expect(parsed.lifecycle).toBe("registered");
        expect(parsed.identifiers).toHaveLength(2);
        expect(
            addAssetIdentifierRequestSchema.safeParse({
                expectedVersion: 0,
                type: "serial_number",
                originalValue: "SN-42",
            }).success,
        ).toBe(false);
    });

    it("validates asset lifecycle and versioned changes", () => {
        expect(assetListQuerySchema.parse({ limit: "2", lifecycle: "retired" }).limit).toBe(2);
        expect(
            setAssetLifecycleRequestSchema.safeParse({
                expectedVersion: 1,
                lifecycle: "unknown",
            }).success,
        ).toBe(false);
        expect(updateAssetRequestSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    });
});
