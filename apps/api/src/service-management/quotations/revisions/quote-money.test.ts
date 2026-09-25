import { quoteDraftContentSchema } from "@ardenfold/contracts";
import { describe, expect, it } from "vitest";

import { calculateQuoteDraft } from "./quote-money";

const draft = {
    currencyCode: "PEN",
    paymentTerms: null,
    deliveryTerms: null,
    serviceLocation: null,
    intakeExpectations: null,
    exclusions: null,
    validUntil: null,
    lines: [
        {
            description: "Inspection A",
            quantity: "3",
            unit: "hour",
            unitPrice: "0.335",
            partyId: null,
            assetId: null,
            adjustments: [{ label: "Discount", amount: "-0.01" }],
        },
        {
            description: "Inspection B",
            quantity: "3",
            unit: "hour",
            unitPrice: "0.335",
            partyId: null,
            assetId: null,
            adjustments: [{ label: "Discount", amount: "-0.01" }],
        },
    ],
    adjustments: [],
};

describe("quotation calculation policy v1", () => {
    it("rounds each full quantity times price once before fixed adjustments", () => {
        const result = calculateQuoteDraft(quoteDraftContentSchema.parse(draft));
        expect(result.lines).toEqual([
            { roundedBaseAmount: "1.01", totalAmount: "1.00" },
            { roundedBaseAmount: "1.01", totalAmount: "1.00" },
        ]);
        expect(result).toMatchObject({ scale: 2, subtotal: "2.00", total: "2.00" });
    });

    it("rejects excess precision rather than rounding financial input", () => {
        expect(() =>
            calculateQuoteDraft(
                quoteDraftContentSchema.parse({
                    ...draft,
                    adjustments: [{ label: "Invalid", amount: "0.001" }],
                }),
            ),
        ).toThrow();
        expect(
            quoteDraftContentSchema.safeParse({
                ...draft,
                lines: [{ ...draft.lines[0], unitPrice: "0.1234567" }],
            }).success,
        ).toBe(false);
    });

    it("rejects a negative line or grand total", () => {
        expect(() =>
            calculateQuoteDraft(
                quoteDraftContentSchema.parse({
                    ...draft,
                    lines: [
                        { ...draft.lines[0], adjustments: [{ label: "Invalid", amount: "-1.02" }] },
                    ],
                }),
            ),
        ).toThrow();
        expect(() =>
            calculateQuoteDraft(
                quoteDraftContentSchema.parse({
                    ...draft,
                    adjustments: [{ label: "Invalid", amount: "-2.01" }],
                }),
            ),
        ).toThrow();
    });

    it("rejects overflow after exact multiplication", () => {
        expect(() =>
            calculateQuoteDraft(
                quoteDraftContentSchema.parse({
                    ...draft,
                    lines: [
                        { ...draft.lines[0], quantity: "999999999999", unitPrice: "999999999999" },
                    ],
                }),
            ),
        ).toThrow();
    });
});
