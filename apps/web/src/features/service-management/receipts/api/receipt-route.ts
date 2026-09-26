import "server-only";

import { correctReceiptSchema, createReceiptSchema, identifierSchema } from "@ardenfold/contracts";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getActiveOrganizationSession } from "@/auth/server-organization";

import { getReceipt, mutateReceipt, ReceiptApiError } from "./receipt-api";

const mutationSchema = z.discriminatedUnion("intent", [
    z.strictObject({ intent: z.literal("create"), payload: createReceiptSchema }),
    z.strictObject({
        intent: z.literal("correct"),
        receiptId: identifierSchema,
        payload: correctReceiptSchema,
    }),
]);

function rejected(error: unknown): NextResponse {
    return NextResponse.json(
        { error: { code: error instanceof ReceiptApiError ? error.code : "RECEIPT_REJECTED" } },
        {
            status: error instanceof ReceiptApiError ? error.status : 500,
            headers: { "cache-control": "no-store" },
        },
    );
}

export async function receiptLookup(request: NextRequest): Promise<NextResponse> {
    const receiptId = request.nextUrl.searchParams.get("id");
    if (!receiptId || !identifierSchema.safeParse(receiptId).success)
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    const { session, organization } = await getActiveOrganizationSession();
    try {
        return NextResponse.json(
            await getReceipt(session.accessToken, organization.id, receiptId),
            {
                headers: { "cache-control": "no-store" },
            },
        );
    } catch (error) {
        return rejected(error);
    }
}

export async function receiptMutation(request: NextRequest): Promise<NextResponse> {
    if (request.headers.get("origin") !== request.nextUrl.origin)
        return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    let value: unknown;
    try {
        const raw = await request.text();
        if (raw.length > 2_200_000) throw new Error("Payload too large");
        value = JSON.parse(raw);
    } catch {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    const parsed = mutationSchema.safeParse(value);
    if (!parsed.success)
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    const action = parsed.data;
    const { session, organization } = await getActiveOrganizationSession();
    try {
        const result = await mutateReceipt(
            session.accessToken,
            organization.id,
            action.intent === "create" ? "/receipts" : `/receipts/${action.receiptId}/correct`,
            action.payload,
        );
        return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    } catch (error) {
        return rejected(error);
    }
}
