import type { QuoteDetail } from "@ardenfold/contracts";

import { formattingLocales, type Locale } from "@/i18n/locales";

/** Formats a decimal without first converting the authoritative value to a JS number. */
export function formatQuoteMoney(
    value: string,
    currencyCode: string,
    currencyScale: number,
    locale: Locale,
): string {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match || (match[3]?.length ?? 0) > currencyScale) {
        throw new Error("Invalid monetary precision");
    }
    const formatter = new Intl.NumberFormat(formattingLocales[locale], {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: currencyScale,
        maximumFractionDigits: currencyScale,
    });
    const negativeZero = match[1] === "-" && BigInt(match[2] ?? "0") === 0n;
    const parts = formatter.formatToParts(negativeZero ? -1n : BigInt(`${match[1]}${match[2]}`));
    return parts
        .map((part) =>
            part.type === "integer" && negativeZero
                ? "0"
                : part.type === "fraction"
                  ? (match[3] ?? "").padEnd(currencyScale, "0")
                  : part.value,
        )
        .join("");
}

export function formatQuoteDecimal(value: string, locale: Locale): string {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) throw new Error("Invalid decimal");
    const parts = new Intl.NumberFormat(formattingLocales[locale]).formatToParts(
        BigInt(match[1] ?? "0"),
    );
    const separator =
        new Intl.NumberFormat(formattingLocales[locale], { minimumFractionDigits: 1 })
            .formatToParts(0)
            .find((part) => part.type === "decimal")?.value ?? ".";
    return `${parts.map((part) => part.value).join("")}${match[2] ? `${separator}${match[2]}` : ""}`;
}

export function activeAcceptedRevision(quote: QuoteDetail): string | null {
    return (
        quote.acceptances.find((item) => item.id === quote.activeAcceptanceId)?.revisionId ?? null
    );
}
