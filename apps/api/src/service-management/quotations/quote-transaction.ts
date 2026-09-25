import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    quoteHistoryEntries,
    quotes,
    serviceRequests,
    type Quote,
    type ServiceRequest,
} from "@ardenfold/database/schema";
import { and, eq, sql } from "drizzle-orm";

import { recordAuditEvent } from "../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { ContractException } from "../../http/contracts";

export type QuoteHistoryKind =
    | "created"
    | "revision.created"
    | "revision.edited"
    | "revision.issued"
    | "revision.superseded"
    | "revision.discarded"
    | "revision.withdrawn"
    | "revision.expired"
    | "revision.rejected"
    | "accepted"
    | "acceptance.withdrawn"
    | "closed";

export async function quoteDecisionTime(tx: ArdenfoldTransaction): Promise<Date> {
    const result = await tx.execute<{ epoch_ms: string }>(sql`
        SELECT floor(extract(epoch from clock_timestamp()) * 1000)::bigint AS epoch_ms
    `);
    return new Date(Number(result.rows[0]!.epoch_ms));
}

// Lock the request before its quotes: request termination uses the same order.
export async function lockQuote(
    tx: ArdenfoldTransaction,
    organizationId: string,
    quoteId: string,
    expectedVersion?: number,
): Promise<{ quote: Quote; request: ServiceRequest }> {
    const [candidate] = await tx
        .select({ requestId: quotes.requestId })
        .from(quotes)
        .where(and(eq(quotes.organizationId, organizationId), eq(quotes.id, quoteId)));
    if (!candidate) throw new ContractException("QUOTE_NOT_FOUND", 404);
    const [request] = await tx
        .select()
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.organizationId, organizationId),
                eq(serviceRequests.id, candidate.requestId),
            ),
        )
        .for("update");
    const [quote] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.organizationId, organizationId), eq(quotes.id, quoteId)))
        .for("update");
    if (!request || !quote) throw new ContractException("QUOTE_NOT_FOUND", 404);
    if (expectedVersion !== undefined && quote.version !== expectedVersion)
        throw new ContractException("VERSION_CONFLICT", 409);
    return { quote, request };
}

export async function advanceQuote(
    tx: ArdenfoldTransaction,
    quote: Quote,
    principal: AuthenticatedPrincipal,
    kind: QuoteHistoryKind,
    revisionId: string | null = null,
    acceptanceId: string | null = null,
    reason: string | null = null,
    changes: Partial<Pick<Quote, "status" | "nextRevisionNumber">> = {},
    context: Record<string, unknown> | null = null,
): Promise<Quote> {
    const [updated] = await tx
        .update(quotes)
        .set({
            ...changes,
            version: quote.version + 1,
            updatedByUserId: principal.user.id,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(quotes.organizationId, quote.organizationId),
                eq(quotes.id, quote.id),
                eq(quotes.version, quote.version),
            ),
        )
        .returning();
    if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
    await recordQuoteHistory(
        tx,
        updated,
        principal,
        kind,
        revisionId,
        acceptanceId,
        reason,
        context,
    );
    return updated;
}

export async function recordQuoteHistory(
    tx: ArdenfoldTransaction,
    quote: Quote,
    principal: AuthenticatedPrincipal,
    kind: QuoteHistoryKind,
    revisionId: string | null = null,
    acceptanceId: string | null = null,
    reason: string | null = null,
    context: Record<string, unknown> | null = null,
): Promise<void> {
    await tx.insert(quoteHistoryEntries).values({
        organizationId: quote.organizationId,
        quoteId: quote.id,
        version: quote.version,
        kind,
        revisionId,
        acceptanceId,
        reason,
        context,
        recordedByUserId: principal.user.id,
    });
    await recordAuditEvent(tx, {
        organizationId: quote.organizationId,
        actorUserId: principal.user.id,
        action: `quote.${kind}`,
        resourceType: "quote",
        resourceId: quote.id,
        metadata: { version: quote.version, revisionId, acceptanceId },
    });
}
