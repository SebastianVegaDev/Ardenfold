import {
    supportedQuoteCurrencies,
    type CreateQuote,
    type QuoteVersion,
} from "@ardenfold/contracts";
import { quoteRevisions, quotes, serviceRequests } from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { PartyReferenceService } from "../../../parties/queries/party-reference.service";
import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";
import {
    advanceQuote,
    lockQuote,
    quoteDecisionTime,
    recordQuoteHistory,
} from "../quote-transaction";
import { QuoteQueriesService } from "../queries/quote-queries.service";
import { writeDraftChildren } from "../revisions/quote-draft-write";
import { resolveQuoteReferences } from "../revisions/quote-references";

@Injectable()
export class QuoteManagementService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly parties: PartyReferenceService,
        private readonly queries: QuoteQueriesService,
    ) {}

    create(principal: AuthenticatedPrincipal, organizationId: string, input: CreateQuote) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["quotations.write", "service_requests.read", "parties.read", "assets.read"],
            async (tx) => {
                const [request] = await tx
                    .select()
                    .from(serviceRequests)
                    .where(
                        and(
                            eq(serviceRequests.organizationId, organizationId),
                            eq(serviceRequests.id, input.requestId),
                        ),
                    )
                    .for("update");
                if (!request) throw new ContractException("SERVICE_REQUEST_NOT_FOUND", 404);
                if (request.status !== "active")
                    throw new ContractException("SERVICE_REQUEST_TERMINAL", 409);
                await this.parties.requireActiveCustomer(
                    tx,
                    organizationId,
                    request.customerPartyId,
                    null,
                );
                await resolveQuoteReferences(tx, organizationId, input.draft);
                const [created] = await tx
                    .insert(quotes)
                    .values({
                        organizationId,
                        requestId: request.id,
                        customerPartyId: request.customerPartyId,
                        reference: input.reference,
                        createdByUserId: principal.user.id,
                        updatedByUserId: principal.user.id,
                    })
                    .onConflictDoNothing({ target: [quotes.organizationId, quotes.reference] })
                    .returning();
                if (!created) throw new ContractException("QUOTE_REFERENCE_CONFLICT", 409);
                await recordQuoteHistory(tx, created, principal, "created");
                const [advanced] = await tx
                    .update(quotes)
                    .set({
                        nextRevisionNumber: 2,
                        version: 2,
                        updatedAt: new Date(),
                    })
                    .where(eq(quotes.id, created.id))
                    .returning();
                const [revision] = await tx
                    .insert(quoteRevisions)
                    .values({
                        organizationId,
                        quoteId: created.id,
                        revisionNumber: 1,
                        sourceRequestVersion: request.version,
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
                        createdByUserId: principal.user.id,
                    })
                    .returning();
                await writeDraftChildren(tx, organizationId, revision!.id, input.draft);
                await recordQuoteHistory(
                    tx,
                    advanced!,
                    principal,
                    "revision.created",
                    revision!.id,
                );
                return this.queries.getInTransaction(tx, organizationId, created.id);
            },
        );
    }

    close(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        input: QuoteVersion,
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
                const revisions = await tx
                    .select()
                    .from(quoteRevisions)
                    .where(
                        and(
                            eq(quoteRevisions.organizationId, organizationId),
                            eq(quoteRevisions.quoteId, quoteId),
                        ),
                    );
                let currentQuote = quote;
                for (const revision of revisions) {
                    if (revision.status === "offered" || revision.status === "draft") {
                        const target =
                            revision.status === "draft"
                                ? "discarded"
                                : revision.validUntil &&
                                    revision.validUntil <= (await quoteDecisionTime(tx))
                                  ? "expired"
                                  : "withdrawn";
                        await tx
                            .update(quoteRevisions)
                            .set({
                                status: target,
                                version: revision.version + 1,
                                updatedAt: new Date(),
                            })
                            .where(eq(quoteRevisions.id, revision.id));
                        currentQuote = await advanceQuote(
                            tx,
                            currentQuote,
                            principal,
                            target === "expired"
                                ? "revision.expired"
                                : target === "withdrawn"
                                  ? "revision.withdrawn"
                                  : "revision.discarded",
                            revision.id,
                            null,
                            input.reason,
                        );
                    }
                }
                await advanceQuote(
                    tx,
                    currentQuote,
                    principal,
                    "closed",
                    null,
                    null,
                    input.reason,
                    { status: "closed" },
                );
                return this.queries.getInTransaction(tx, organizationId, quoteId);
            },
        );
    }
}
