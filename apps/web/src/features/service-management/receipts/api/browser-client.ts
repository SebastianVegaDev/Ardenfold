import { receiptDetailSchema, type ReceiptDetail } from "@ardenfold/contracts";

export class ReceiptWebError extends Error {
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
                : "RECEIPT_REJECTED";
        throw new ReceiptWebError(response.status, code);
    }
    return value;
}

export async function fetchCurrentReceipt(id: string): Promise<ReceiptDetail> {
    return receiptDetailSchema.parse(
        await read(
            await fetch(`/auth/receipts?id=${encodeURIComponent(id)}`, { cache: "no-store" }),
        ),
    );
}

export async function submitReceipt(value: unknown): Promise<ReceiptDetail> {
    return receiptDetailSchema.parse(
        await read(
            await fetch("/auth/receipts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(value),
            }),
        ),
    );
}
