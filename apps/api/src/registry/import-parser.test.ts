import { describe, expect, it } from "vitest";

import { csvTemplate, parseImportCsv } from "./import-parser";

describe("registry CSV imports", () => {
    it("parses a versioned party template and quoted fields", () => {
        const rows = parseImportCsv(
            "party",
            'template_version,display_name,kind,roles,legal_name,identifier_type,identifier_value\r\n1,"Acme, Inc",organization,customer|provider,,tax_id,TAX-001\r\n',
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.errors).toEqual([]);
        expect(rows[0]?.displayName).toBe("Acme, Inc");
        expect(rows[0]?.identifier).toEqual({ type: "tax_id", originalValue: "TAX-001" });
        expect(csvTemplate("asset")).toContain("template_version,display_name");
    });

    it("keeps invalid rows as actionable rejections", () => {
        const rows = parseImportCsv(
            "asset",
            "template_version,display_name,description,manufacturer,model,classification,lifecycle,identifier_type,identifier_value\n2,Unnamed,,,,,invalid,serial,!!!\n",
        );
        expect(rows[0]?.errors.map((error) => error.code)).toEqual([
            "INVALID_TEMPLATE_VERSION",
            "INVALID_IDENTIFIER",
            "INVALID_LIFECYCLE",
        ]);
    });

    it("rejects malformed, oversized and incorrectly encoded files before staging", () => {
        expect(() =>
            parseImportCsv("party", 'template_version,display_name\n1,"unclosed'),
        ).toThrow();
        expect(() => parseImportCsv("party", `${csvTemplate("party")}\uFFFD`)).toThrow();
        expect(() => parseImportCsv("party", "x".repeat(524_289))).toThrow();
        expect(() =>
            parseImportCsv(
                "party",
                csvTemplate("party") + "1,x,organization,customer,,,\n".repeat(500),
            ),
        ).toThrow();
    });
});
