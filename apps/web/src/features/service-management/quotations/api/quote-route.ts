import "server-only";

import {
    acceptQuoteRevisionSchema,
    copyQuoteRevisionSchema,
    createQuoteSchema,
    editQuoteDraftSchema,
    identifierSchema,
    issueQuoteRevisionSchema,
    quoteVersionSchema,
    rejectQuoteRevisionSchema,
} from "@ardenfold/contracts";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getActiveOrganizationSession } from "@/auth/server-organization";

import { getQuote, mutateQuote, QuoteApiError } from "./quote-api";

const mutationSchema = z.discriminatedUnion("intent", [
    z.strictObject({ intent: z.literal("create"), payload: createQuoteSchema }),
    z.strictObject({
        intent: z.literal("edit"),
        quoteId: identifierSchema,
        revisionId: identifierSchema,
        payload: editQuoteDraftSchema,
    }),
    z.strictObject({
        intent: z.literal("copy"),
        quoteId: identifierSchema,
        payload: copyQuoteRevisionSchema,
    }),
    z.strictObject({
        intent: z.literal("issue"),
        quoteId: identifierSchema,
        revisionId: identifierSchema,
        payload: issueQuoteRevisionSchema,
    }),
    z.strictObject({
        intent: z.enum(["discard", "withdraw", "expire"]),
        quoteId: identifierSchema,
        revisionId: identifierSchema,
        payload: quoteVersionSchema,
    }),
    z.strictObject({
        intent: z.literal("accept"),
        quoteId: identifierSchema,
        payload: acceptQuoteRevisionSchema,
    }),
    z.strictObject({
        intent: z.literal("reject"),
        quoteId: identifierSchema,
        payload: rejectQuoteRevisionSchema,
    }),
    z.strictObject({
        intent: z.enum(["withdrawAcceptance", "close"]),
        quoteId: identifierSchema,
        payload: quoteVersionSchema,
    }),
]);

function rejected(error: unknown): NextResponse {
    return NextResponse.json(
        { error: { code: error instanceof QuoteApiError ? error.code : "QUOTE_REJECTED" } },
        {
            status: error instanceof QuoteApiError ? error.status : 500,
            headers: { "cache-control": "no-store" },
        },
    );
}

export async function quoteLookup(request: NextRequest): Promise<NextResponse> {
    const quoteId = request.nextUrl.searchParams.get("id");
    if (!quoteId || !identifierSchema.safeParse(quoteId).success) {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    const { session, organization } = await getActiveOrganizationSession();
    try {
        return NextResponse.json(await getQuote(session.accessToken, organization.id, quoteId), {
            headers: { "cache-control": "no-store" },
        });
    } catch (error) {
        return rejected(error);
    }
}

export async function quoteMutation(request: NextRequest): Promise<NextResponse> {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
        return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    let value: unknown;
    try {
        const raw = await request.text();
        if (raw.length > 2_200_000) throw new Error("Payload too large");
        value = JSON.parse(raw);
    } catch {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    const parsed = mutationSchema.safeParse(value);
    if (!parsed.success) {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    const action = parsed.data;
    const { session, organization } = await getActiveOrganizationSession();
    try {
        const base = action.intent === "create" ? "/quotations" : `/quotations/${action.quoteId}`;
        const path =
            action.intent === "create"
                ? base
                : action.intent === "edit"
                  ? `${base}/revisions/${action.revisionId}`
                  : action.intent === "copy"
                    ? `${base}/revisions`
                    : ["issue", "discard", "withdraw", "expire"].includes(action.intent)
                      ? `${base}/revisions/${"revisionId" in action ? action.revisionId : ""}/${action.intent}`
                      : action.intent === "accept"
                        ? `${base}/acceptances`
                        : action.intent === "withdrawAcceptance"
                          ? `${base}/acceptances/withdraw`
                          : `${base}/${action.intent}`;
        const result = await mutateQuote(
            session.accessToken,
            organization.id,
            path,
            action.intent === "edit" ? "PATCH" : "POST",
            action.payload,
        );
        return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    } catch (error) {
        return rejected(error);
    }
}
