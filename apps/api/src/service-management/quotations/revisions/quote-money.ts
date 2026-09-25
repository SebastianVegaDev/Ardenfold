import { supportedQuoteCurrencies, type CreateQuote } from "@ardenfold/contracts";
import Decimal from "decimal.js";

import { ContractException } from "../../../http/contracts";

const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
const maximumAmount = new Exact("1000000000000000000");

type Draft = CreateQuote["draft"];

function amount(input: string, scale: number): Decimal {
    const value = new Exact(input);
    if (value.decimalPlaces() > scale || value.abs().gte(maximumAmount))
        throw new ContractException("INVALID_QUOTE_AMOUNT", 400);
    return value;
}

function bounded(value: Decimal, scale: number): string {
    if (value.abs().gte(maximumAmount)) throw new ContractException("QUOTE_AMOUNT_OVERFLOW", 400);
    return value.toFixed(scale);
}

export function calculateQuoteDraft(draft: Draft) {
    const scale = supportedQuoteCurrencies[draft.currencyCode];
    const lines = draft.lines.map((line) => {
        const base = new Exact(line.quantity)
            .times(new Exact(line.unitPrice))
            .toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
        const total = line.adjustments.reduce(
            (sum, adjustment) => sum.plus(amount(adjustment.amount, scale)),
            base,
        );
        if (total.isNegative()) throw new ContractException("NEGATIVE_QUOTE_LINE_TOTAL", 400);
        return { roundedBaseAmount: bounded(base, scale), totalAmount: bounded(total, scale) };
    });
    const subtotal = lines.reduce((sum, line) => sum.plus(line.totalAmount), new Exact(0));
    const total = draft.adjustments.reduce(
        (sum, adjustment) => sum.plus(amount(adjustment.amount, scale)),
        subtotal,
    );
    if (total.isNegative()) throw new ContractException("NEGATIVE_QUOTE_TOTAL", 400);
    return {
        scale,
        lines,
        subtotal: bounded(subtotal, scale),
        total: bounded(total, scale),
    };
}
