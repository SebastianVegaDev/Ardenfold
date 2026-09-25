import {
    quoteDraftContentSchema,
    supportedQuoteCurrencies,
    type CopyQuoteRevision,
    type CreateQuote,
    type EditQuoteDraft,
    type IssueQuoteRevision,
    type QuoteVersion,
} from "@ardenfold/contracts";
import { parties, quoteRevisionLines, quoteRevisions, quotes } from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";
import {
    advanceQuote,
    lockQuote,
    quoteDecisionTime,
    recordQuoteHistory,
    type QuoteHistoryKind,
} from "../quote-transaction";
import { QuoteQueriesService } from "../queries/quote-queries.service";
import { clearDraftChildren, writeDraftChildren } from "./quote-draft-write";
import { calculateQuoteDraft } from "./quote-money";
import { resolveQuoteReferences } from "./quote-references";

type Draft = CreateQuote["draft"];

@Injectable()
export class QuoteRevisionsService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly queries: QuoteQueriesService,
    ) {}

    edit(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        revisionId: string,
        input: EditQuoteDraft,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["quotations.write", "service_requests.read", "parties.read", "assets.read"],
            async (tx) => {
                const { quote } = await lockQuote(
                    tx,
                    organizationId,
                    quoteId,
                    input.expectedVersion,
                );
                if (quote.status === "closed") throw new ContractException("QUOTE_CLOSED", 409);
                const [revision] = await tx
                    .select()
                    .from(quoteRevisions)
                    .where(
                        and(
                            eq(quoteRevisions.organizationId, organizationId),
                            eq(quoteRevisions.quoteId, quoteId),
                            eq(quoteRevisions.id, revisionId),
                        ),
                    )
                    .for("update");
                if (!revision) throw new ContractException("QUOTE_REVISION_NOT_FOUND", 404);
                if (revision.status !== "draft")
                    throw new ContractException("QUOTE_REVISION_LOCKED", 409);
                const before = (
                    await this.queries.getInTransaction(tx, organizationId, quoteId)
                ).revisions.find((item) => item.id === revisionId)!;
                await resolveQuoteReferences(tx, organizationId, input.draft);
                calculateQuoteDraft(input.draft);
                await clearDraftChildren(tx, organizationId, revisionId);
                await tx
                    .update(quoteRevisions)
                    .set({
                        currencyCode: input.draft.currencyCode,
                        currencyScale: supportedQuoteCurrencies[input.draft.currencyCode],
                        paymentTerms: input.draft.paymentTerms,
                        deliveryTerms: input.draft.deliveryTerms,
                        serviceLocation: input.draft.serviceLocation,
                        intakeExpectations: input.draft.intakeExpectations,
                        exclusions: input.draft.exclusions,
                        validUntil: input.draft.validUntil
                            ? new Date(input.draft.validUntil)
                            : null,
                        version: revision.version + 1,
                        updatedAt: new Date(),
                    })
                    .where(eq(quoteRevisions.id, revisionId));
                await writeDraftChildren(tx, organizationId, revisionId, input.draft);
                await advanceQuote(
                    tx,
                    quote,
                    principal,
                    "revision.edited",
                    revisionId,
                    null,
                    input.reason,
                    {},
                    { before, after: input.draft },
                );
                return this.queries.getInTransaction(tx, organizationId, quoteId);
            },
        );
    }

    copy(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        input: CopyQuoteRevision,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["quotations.write", "service_requests.read", "parties.read", "assets.read"],
            async (tx) => {
                const { quote, request } = await lockQuote(
                    tx,
                    organizationId,
                    quoteId,
                    input.expectedVersion,
                );
                if (quote.status === "closed" || request.status !== "active")
                    throw new ContractException("QUOTE_NOT_REVISABLE", 409);
                const detail = await this.queries.getInTransaction(tx, organizationId, quoteId);
                if (detail.revisions.some((revision) => revision.status === "draft"))
                    throw new ContractException("QUOTE_DRAFT_EXISTS", 409);
                const source = detail.revisions.find(
                    (revision) => revision.id === input.sourceRevisionId,
                );
                if (!source || source.status === "discarded")
                    throw new ContractException("QUOTE_REVISION_NOT_FOUND", 404);
                const draft: Draft = quoteDraftContentSchema.parse({
                    currencyCode: source.currencyCode,
                    paymentTerms: source.paymentTerms,
                    deliveryTerms: source.deliveryTerms,
                    serviceLocation: source.serviceLocation,
                    intakeExpectations: source.intakeExpectations,
                    exclusions: source.exclusions,
                    validUntil: source.validUntil,
                    lines: source.lines.map((line) => ({
                        description: line.description,
                        quantity: line.quantity,
                        unit: line.unit,
                        unitPrice: line.unitPrice,
                        partyId: line.partyId,
                        assetId: line.assetId,
                        adjustments: line.adjustments,
                    })),
                    adjustments: source.adjustments,
                });
                await resolveQuoteReferences(tx, organizationId, draft);
                const [advanced] = await tx
                    .update(quotes)
                    .set({
                        nextRevisionNumber: quote.nextRevisionNumber + 1,
                        version: quote.version + 1,
                        updatedByUserId: principal.user.id,
                        updatedAt: new Date(),
                    })
                    .where(eq(quotes.id, quoteId))
                    .returning();
                const [revision] = await tx
                    .insert(quoteRevisions)
                    .values({
                        organizationId,
                        quoteId,
                        revisionNumber: quote.nextRevisionNumber,
                        sourceRevisionId: source.id,
                        sourceRequestVersion: request.version,
                        currencyCode: draft.currencyCode,
                        currencyScale: supportedQuoteCurrencies[draft.currencyCode],
                        paymentTerms: draft.paymentTerms,
                        deliveryTerms: draft.deliveryTerms,
                        serviceLocation: draft.serviceLocation,
                        intakeExpectations: draft.intakeExpectations,
                        exclusions: draft.exclusions,
                        validUntil: draft.validUntil ? new Date(draft.validUntil) : null,
                        createdByUserId: principal.user.id,
                    })
                    .returning();
                await writeDraftChildren(tx, organizationId, revision!.id, draft);
                await recordQuoteHistory(
                    tx,
                    advanced!,
                    principal,
                    "revision.created",
                    revision!.id,
                );
                return this.queries.getInTransaction(tx, organizationId, quoteId);
            },
        );
    }

    issue(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        revisionId: string,
        input: IssueQuoteRevision,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["quotations.write", "service_requests.read", "parties.read", "assets.read"],
            async (tx) => {
                const { quote, request } = await lockQuote(
                    tx,
                    organizationId,
                    quoteId,
                    input.expectedVersion,
                );
                if (quote.status !== "open" || request.status !== "active")
                    throw new ContractException("QUOTE_NOT_ISSUABLE", 409);
                const detail = await this.queries.getInTransaction(tx, organizationId, quoteId);
                const draftRevision = detail.revisions.find(
                    (revision) => revision.id === revisionId,
                );
                if (!draftRevision) throw new ContractException("QUOTE_REVISION_NOT_FOUND", 404);
                if (draftRevision.status !== "draft")
                    throw new ContractException("QUOTE_REVISION_LOCKED", 409);
                if (!draftRevision.lines.length)
                    throw new ContractException("EMPTY_QUOTE_REVISION", 409);
                const draft: Draft = quoteDraftContentSchema.parse({
                    currencyCode: draftRevision.currencyCode,
                    paymentTerms: draftRevision.paymentTerms,
                    deliveryTerms: draftRevision.deliveryTerms,
                    serviceLocation: draftRevision.serviceLocation,
                    intakeExpectations: draftRevision.intakeExpectations,
                    exclusions: draftRevision.exclusions,
                    validUntil: draftRevision.validUntil,
                    adjustments: draftRevision.adjustments,
                    lines: draftRevision.lines.map((line) => ({
                        description: line.description,
                        quantity: line.quantity,
                        unit: line.unit,
                        unitPrice: line.unitPrice,
                        partyId: line.partyId,
                        assetId: line.assetId,
                        adjustments: line.adjustments,
                    })),
                });
                const now = await quoteDecisionTime(tx);
                if (draft.validUntil && new Date(draft.validUntil) <= now)
                    throw new ContractException("QUOTE_VALIDITY_ELAPSED", 409);
                const calculation = calculateQuoteDraft(draft);
                const references = await resolveQuoteReferences(tx, organizationId, draft);
                const [customer] = await tx
                    .select({
                        displayName: parties.displayName,
                        legalName: parties.legalName,
                        status: parties.status,
                    })
                    .from(parties)
                    .where(
                        and(
                            eq(parties.organizationId, organizationId),
                            eq(parties.id, quote.customerPartyId),
                        ),
                    )
                    .for("share");
                if (!customer || customer.status !== "active")
                    throw new ContractException("CUSTOMER_NOT_FOUND", 404);
                for (const [index, line] of draftRevision.lines.entries()) {
                    await tx
                        .update(quoteRevisionLines)
                        .set({
                            roundedBaseAmount: calculation.lines[index]!.roundedBaseAmount,
                            totalAmount: calculation.lines[index]!.totalAmount,
                            partySnapshot: line.partyId
                                ? references.partySnapshots.get(line.partyId)!
                                : null,
                            assetSnapshot: line.assetId
                                ? references.assetSnapshots.get(line.assetId)!
                                : null,
                        })
                        .where(
                            and(
                                eq(quoteRevisionLines.organizationId, organizationId),
                                eq(quoteRevisionLines.id, line.id),
                            ),
                        );
                }
                const [previous] = await tx
                    .select()
                    .from(quoteRevisions)
                    .where(
                        and(
                            eq(quoteRevisions.organizationId, organizationId),
                            eq(quoteRevisions.quoteId, quoteId),
                            eq(quoteRevisions.status, "offered"),
                        ),
                    );
                let currentQuote = quote;
                if (previous) {
                    const expired = previous.validUntil && previous.validUntil <= now;
                    await tx
                        .update(quoteRevisions)
                        .set({
                            status: expired ? "expired" : "superseded",
                            supersededByRevisionId: expired ? null : revisionId,
                            version: previous.version + 1,
                            updatedAt: now,
                        })
                        .where(eq(quoteRevisions.id, previous.id));
                    currentQuote = await advanceQuote(
                        tx,
                        currentQuote,
                        principal,
                        expired ? "revision.expired" : "revision.superseded",
                        previous.id,
                    );
                }
                await tx
                    .update(quoteRevisions)
                    .set({
                        status: "offered",
                        version: draftRevision.version + 1,
                        issuedAt: now,
                        issueChannel: input.channel,
                        issuedByUserId: principal.user.id,
                        customerSnapshot: {
                            partyId: quote.customerPartyId,
                            displayName: customer.displayName,
                            legalName: customer.legalName,
                            capturedAt: now.toISOString(),
                        },
                        subtotal: calculation.subtotal,
                        total: calculation.total,
                        updatedAt: now,
                    })
                    .where(eq(quoteRevisions.id, revisionId));
                await advanceQuote(tx, currentQuote, principal, "revision.issued", revisionId);
                return this.queries.getInTransaction(tx, organizationId, quoteId);
            },
        );
    }

    discard(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        revisionId: string,
        input: QuoteVersion,
    ) {
        return this.changeRevision(
            principal,
            organizationId,
            quoteId,
            revisionId,
            input,
            "draft",
            "discarded",
            "revision.discarded",
        );
    }

    withdrawOffer(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        revisionId: string,
        input: QuoteVersion,
    ) {
        return this.changeRevision(
            principal,
            organizationId,
            quoteId,
            revisionId,
            input,
            "offered",
            "withdrawn",
            "revision.withdrawn",
        );
    }

    private changeRevision(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        revisionId: string,
        input: QuoteVersion,
        from: "draft" | "offered",
        to: "discarded" | "withdrawn",
        kind: QuoteHistoryKind,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["quotations.write", "service_requests.read"],
            async (tx) => {
                const { quote } = await lockQuote(
                    tx,
                    organizationId,
                    quoteId,
                    input.expectedVersion,
                );
                if (quote.status !== "open") throw new ContractException("QUOTE_NOT_OPEN", 409);
                const [revision] = await tx
                    .select()
                    .from(quoteRevisions)
                    .where(
                        and(
                            eq(quoteRevisions.organizationId, organizationId),
                            eq(quoteRevisions.quoteId, quoteId),
                            eq(quoteRevisions.id, revisionId),
                        ),
                    );
                if (!revision) throw new ContractException("QUOTE_REVISION_NOT_FOUND", 404);
                if (revision.status !== from)
                    throw new ContractException("INVALID_QUOTE_REVISION_TRANSITION", 409);
                if (
                    from === "offered" &&
                    revision.validUntil &&
                    revision.validUntil <= (await quoteDecisionTime(tx))
                )
                    throw new ContractException("QUOTE_REVISION_EXPIRED", 409);
                await tx
                    .update(quoteRevisions)
                    .set({
                        status: to,
                        version: revision.version + 1,
                        updatedAt: new Date(),
                    })
                    .where(eq(quoteRevisions.id, revisionId));
                await advanceQuote(tx, quote, principal, kind, revisionId, null, input.reason);
                return this.queries.getInTransaction(tx, organizationId, quoteId);
            },
        );
    }
}
