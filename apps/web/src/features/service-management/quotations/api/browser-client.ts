import { quoteAcceptanceSchema, quoteDetailSchema, type QuoteDetail } from "@ardenfold/contracts";

export class QuoteWebError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(code);
    }
}

async function read(response: Response): Promise<unknown> {
    const value: unknown = await response.json();
    if (!response.ok) {
        const code =
            typeof value === "object" &&
            value !== null &&
            "error" in value &&
            typeof value.error === "object" &&
            value.error !== null &&
            "code" in value.error &&
            typeof value.error.code === "string"
                ? value.error.code
                : "QUOTE_REJECTED";
        throw new QuoteWebError(response.status, code);
    }
    return value;
}

export async function fetchCurrentQuote(id: string): Promise<QuoteDetail> {
    const params = new URLSearchParams({ id });
    return quoteDetailSchema.parse(
        await read(await fetch(`/auth/quotations?${params}`, { cache: "no-store" })),
    );
}

export async function submitQuote(value: unknown): Promise<QuoteDetail | null> {
    const result = await read(
        await fetch("/auth/quotations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(value),
        }),
    );
    if (
        typeof value === "object" &&
        value !== null &&
        "intent" in value &&
        value.intent === "accept"
    ) {
        quoteAcceptanceSchema.parse(result);
        return null;
    }
    return quoteDetailSchema.parse(result);
}
