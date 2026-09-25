import { createHash } from "node:crypto";

import type { AcceptQuoteRevision, QuoteVersion, RejectQuoteRevision } from "@ardenfold/contracts";
import { quoteAcceptances, quoteRevisions } from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";
import { PartyReferenceService } from "../../../parties/queries/party-reference.service";
import { advanceQuote, lockQuote, quoteDecisionTime } from "../quote-transaction";
import { QuoteQueriesService } from "../queries/quote-queries.service";

function payloadHash(input: AcceptQuoteRevision): string {
    return createHash("sha256")
        .update(
            JSON.stringify([
                input.expectedVersion,
                input.idempotencyKey,
                input.revisionId,
                input.agreementAt,
                input.suppliedByName,
                input.suppliedByContactId,
                input.channel,
                input.externalReference,
            ]),
        )
        .digest("hex");
}

@Injectable()
export class QuoteAcceptanceService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly parties: PartyReferenceService,
        private readonly queries: QuoteQueriesService,
    ) {}

    accept(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        input: AcceptQuoteRevision,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["quotations.write", "service_requests.read", "parties.read"],
            async (tx) => {
                const { quote, request } = await lockQuote(tx, organizationId, quoteId);
                const hash = payloadHash(input);
                const [replay] = await tx
                    .select()
                    .from(quoteAcceptances)
                    .where(
                        and(
                            eq(quoteAcceptances.organizationId, organizationId),
                            eq(quoteAcceptances.idempotencyKey, input.idempotencyKey),
                        ),
                    );
                if (replay) {
                    if (replay.quoteId !== quoteId || replay.payloadHash !== hash)
                        throw new ContractException("IDEMPOTENCY_KEY_CONFLICT", 409);
                    const detail = await this.queries.getInTransaction(tx, organizationId, quoteId);
                    return detail.acceptances.find((acceptance) => acceptance.id === replay.id)!;
                }
                if (quote.version !== input.expectedVersion)
                    throw new ContractException("VERSION_CONFLICT", 409);
                if (quote.status !== "open" || request.status !== "active")
                    throw new ContractException("QUOTE_NOT_ACCEPTABLE", 409);
                const [revision] = await tx
                    .select()
                    .from(quoteRevisions)
                    .where(
                        and(
                            eq(quoteRevisions.organizationId, organizationId),
                            eq(quoteRevisions.quoteId, quoteId),
                            eq(quoteRevisions.id, input.revisionId),
                        ),
                    );
                if (!revision) throw new ContractException("QUOTE_REVISION_NOT_FOUND", 404);
                if (revision.status !== "offered")
                    throw new ContractException("QUOTE_REVISION_NOT_OFFERED", 409);
                const now = await quoteDecisionTime(tx);
                if (revision.validUntil && revision.validUntil <= now)
                    throw new ContractException("QUOTE_REVISION_EXPIRED", 409);
                if (input.agreementAt && new Date(input.agreementAt) > now)
                    throw new ContractException("FUTURE_AGREEMENT_TIME", 400);
                await this.parties.requireActiveCustomer(
                    tx,
                    organizationId,
                    quote.customerPartyId,
                    input.suppliedByContactId,
                );
                const [accepted] = await tx
                    .insert(quoteAcceptances)
                    .values({
                        organizationId,
                        quoteId,
                        revisionId: revision.id,
                        idempotencyKey: input.idempotencyKey,
                        payloadHash: hash,
                        agreementAt: input.agreementAt ? new Date(input.agreementAt) : null,
                        recordedAt: now,
                        recordedByUserId: principal.user.id,
                        suppliedByName: input.suppliedByName,
                        suppliedByContactId: input.suppliedByContactId,
                        channel: input.channel,
                        externalReference: input.externalReference,
                    })
                    .onConflictDoNothing({
                        target: [quoteAcceptances.organizationId, quoteAcceptances.idempotencyKey],
                    })
                    .returning();
                if (!accepted) throw new ContractException("IDEMPOTENCY_KEY_CONFLICT", 409);
                await tx
                    .update(quoteRevisions)
                    .set({
                        status: "accepted",
                        version: revision.version + 1,
                        updatedAt: now,
                    })
                    .where(eq(quoteRevisions.id, revision.id));
                await advanceQuote(
                    tx,
                    quote,
                    principal,
                    "accepted",
                    revision.id,
                    accepted.id,
                    null,
                    { status: "accepted" },
                );
                const detail = await this.queries.getInTransaction(tx, organizationId, quoteId);
                return detail.acceptances.find((acceptance) => acceptance.id === accepted.id)!;
            },
        );
    }

    reject(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        input: RejectQuoteRevision,
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
                            eq(quoteRevisions.id, input.revisionId),
                        ),
                    );
                if (!revision) throw new ContractException("QUOTE_REVISION_NOT_FOUND", 404);
                if (revision.status !== "offered")
                    throw new ContractException("QUOTE_REVISION_NOT_OFFERED", 409);
                const now = await quoteDecisionTime(tx);
                if (revision.validUntil && revision.validUntil <= now)
                    throw new ContractException("QUOTE_REVISION_EXPIRED", 409);
                await tx
                    .update(quoteRevisions)
                    .set({
                        status: "rejected",
                        version: revision.version + 1,
                        updatedAt: now,
                    })
                    .where(eq(quoteRevisions.id, revision.id));
                await advanceQuote(
                    tx,
                    quote,
                    principal,
                    "revision.rejected",
                    revision.id,
                    null,
                    input.reason,
                    {},
                    { channel: input.channel, suppliedByName: input.suppliedByName },
                );
                return this.queries.getInTransaction(tx, organizationId, quoteId);
            },
        );
    }

    expire(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        quoteId: string,
        revisionId: string,
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
                if (
                    revision.status !== "offered" ||
                    !revision.validUntil ||
                    revision.validUntil > (await quoteDecisionTime(tx))
                )
                    throw new ContractException("QUOTE_REVISION_NOT_EXPIRED", 409);
                await tx
                    .update(quoteRevisions)
                    .set({
                        status: "expired",
                        version: revision.version + 1,
                        updatedAt: new Date(),
                    })
                    .where(eq(quoteRevisions.id, revision.id));
                await advanceQuote(
                    tx,
                    quote,
                    principal,
                    "revision.expired",
                    revision.id,
                    null,
                    input.reason,
                );
                return this.queries.getInTransaction(tx, organizationId, quoteId);
            },
        );
    }

    withdraw(
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
                if (quote.status !== "accepted")
                    throw new ContractException("QUOTE_NOT_ACCEPTED", 409);
                const [acceptance] = await tx
                    .select()
                    .from(quoteAcceptances)
                    .where(
                        and(
                            eq(quoteAcceptances.organizationId, organizationId),
                            eq(quoteAcceptances.quoteId, quoteId),
                            isNull(quoteAcceptances.withdrawnAt),
                        ),
                    );
                if (!acceptance) throw new ContractException("QUOTE_ACCEPTANCE_NOT_FOUND", 404);
                await tx
                    .update(quoteAcceptances)
                    .set({
                        withdrawnAt: new Date(),
                        withdrawnByUserId: principal.user.id,
                        withdrawalReason: input.reason,
                    })
                    .where(eq(quoteAcceptances.id, acceptance.id));
                await advanceQuote(
                    tx,
                    quote,
                    principal,
                    "acceptance.withdrawn",
                    acceptance.revisionId,
                    acceptance.id,
                    input.reason,
                    { status: "open" },
                );
                return this.queries.getInTransaction(tx, organizationId, quoteId);
            },
        );
    }
}
