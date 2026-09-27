import { createHash } from "node:crypto";

import {
    quoteDetailSchema,
    quoteListResponseSchema,
    quoteSummarySchema,
    type QuoteDetail,
    type QuoteListQuery,
    type QuoteListResponse,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    quoteAcceptances,
    quoteHistoryEntries,
    quoteLineAdjustments,
    quoteRevisionAdjustments,
    quoteRevisionLines,
    quoteRevisions,
    quotes,
    serviceRequests,
    type Quote,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import {
    and,
    asc,
    desc,
    eq,
    exists,
    getTableColumns,
    gt,
    gte,
    ilike,
    inArray,
    lt,
    lte,
    or,
    sql,
} from "drizzle-orm";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";

const cursorSchema = z.strictObject({
    createdAt: z.iso.datetime({ precision: 6 }),
    id: z.uuid(),
    status: z.string().nullable(),
    requestId: z.uuid().nullable(),
    customerPartyId: z.uuid().nullable(),
    searchFingerprint: z.string().optional(),
});

function searchFingerprint(query: QuoteListQuery): string {
    return createHash("sha256")
        .update(
            JSON.stringify([
                query.siteId ?? null,
                query.assetId ?? null,
                query.q ?? null,
                query.createdFrom ?? null,
                query.createdTo ?? null,
                query.sort ?? "newest",
            ]),
        )
        .digest("hex");
}

function summary(quote: Quote, activeAcceptanceId: string | null) {
    return quoteSummarySchema.parse({
        id: quote.id,
        requestId: quote.requestId,
        customerPartyId: quote.customerPartyId,
        reference: quote.reference,
        status: quote.status,
        version: quote.version,
        activeAcceptanceId,
        createdAt: quote.createdAt.toISOString(),
        updatedAt: quote.updatedAt.toISOString(),
    });
}

@Injectable()
export class QuoteQueriesService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    get(principal: AuthenticatedPrincipal, organizationId: string, quoteId: string) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["quotations.read"],
            (tx) => this.getInTransaction(tx, organizationId, quoteId),
        );
    }

    async getInTransaction(
        tx: ArdenfoldTransaction,
        organizationId: string,
        quoteId: string,
    ): Promise<QuoteDetail> {
        const [quote] = await tx
            .select()
            .from(quotes)
            .where(and(eq(quotes.organizationId, organizationId), eq(quotes.id, quoteId)));
        if (!quote) throw new ContractException("QUOTE_NOT_FOUND", 404);
        const revisions = await tx
            .select()
            .from(quoteRevisions)
            .where(
                and(
                    eq(quoteRevisions.organizationId, organizationId),
                    eq(quoteRevisions.quoteId, quoteId),
                ),
            )
            .orderBy(quoteRevisions.revisionNumber);
        const acceptances = await tx
            .select()
            .from(quoteAcceptances)
            .where(
                and(
                    eq(quoteAcceptances.organizationId, organizationId),
                    eq(quoteAcceptances.quoteId, quoteId),
                ),
            )
            .orderBy(quoteAcceptances.recordedAt, quoteAcceptances.id);
        const history = await tx
            .select()
            .from(quoteHistoryEntries)
            .where(
                and(
                    eq(quoteHistoryEntries.organizationId, organizationId),
                    eq(quoteHistoryEntries.quoteId, quoteId),
                ),
            )
            .orderBy(quoteHistoryEntries.version);
        const revisionIds = revisions.map((revision) => revision.id);
        const allLines = revisionIds.length
            ? await tx
                  .select()
                  .from(quoteRevisionLines)
                  .where(
                      and(
                          eq(quoteRevisionLines.organizationId, organizationId),
                          inArray(quoteRevisionLines.revisionId, revisionIds),
                      ),
                  )
                  .orderBy(quoteRevisionLines.position)
            : [];
        const lineAdjustments = revisionIds.length
            ? await tx
                  .select()
                  .from(quoteLineAdjustments)
                  .where(
                      and(
                          eq(quoteLineAdjustments.organizationId, organizationId),
                          inArray(quoteLineAdjustments.revisionId, revisionIds),
                      ),
                  )
                  .orderBy(quoteLineAdjustments.position)
            : [];
        const revisionAdjustments = revisionIds.length
            ? await tx
                  .select()
                  .from(quoteRevisionAdjustments)
                  .where(
                      and(
                          eq(quoteRevisionAdjustments.organizationId, organizationId),
                          inArray(quoteRevisionAdjustments.revisionId, revisionIds),
                      ),
                  )
                  .orderBy(quoteRevisionAdjustments.position)
            : [];
        const activeAcceptance = acceptances.find((acceptance) => !acceptance.withdrawnAt);
        return quoteDetailSchema.parse({
            ...summary(quote, activeAcceptance?.id ?? null),
            revisions: revisions.map((revision) => ({
                id: revision.id,
                quoteId: revision.quoteId,
                revisionNumber: revision.revisionNumber,
                sourceRevisionId: revision.sourceRevisionId,
                supersededByRevisionId: revision.supersededByRevisionId,
                status:
                    revision.status === "offered" &&
                    revision.validUntil &&
                    revision.validUntil <= new Date()
                        ? "expired"
                        : revision.status,
                version: revision.version,
                sourceRequestVersion: revision.sourceRequestVersion,
                currencyCode: revision.currencyCode,
                currencyScale: revision.currencyScale,
                calculationPolicyVersion: revision.calculationPolicyVersion,
                paymentTerms: revision.paymentTerms,
                deliveryTerms: revision.deliveryTerms,
                serviceLocation: revision.serviceLocation,
                intakeExpectations: revision.intakeExpectations,
                exclusions: revision.exclusions,
                validUntil: revision.validUntil?.toISOString() ?? null,
                customerSnapshot: revision.customerSnapshot,
                issuedAt: revision.issuedAt?.toISOString() ?? null,
                issueChannel: revision.issueChannel,
                subtotal: revision.subtotal,
                total: revision.total,
                createdAt: revision.createdAt.toISOString(),
                lines: allLines
                    .filter((line) => line.revisionId === revision.id)
                    .map((line) => ({
                        id: line.id,
                        position: line.position,
                        description: line.description,
                        quantity: line.quantity,
                        unit: line.unit,
                        unitPrice: line.unitPrice,
                        partyId: line.partyId,
                        assetId: line.assetId,
                        roundedBaseAmount: line.roundedBaseAmount,
                        totalAmount: line.totalAmount,
                        partySnapshot: line.partySnapshot,
                        assetSnapshot: line.assetSnapshot,
                        adjustments: lineAdjustments
                            .filter((adjustment) => adjustment.lineId === line.id)
                            .map((adjustment) => ({
                                label: adjustment.label,
                                amount: adjustment.amount,
                            })),
                    })),
                adjustments: revisionAdjustments
                    .filter((adjustment) => adjustment.revisionId === revision.id)
                    .map((adjustment) => ({ label: adjustment.label, amount: adjustment.amount })),
            })),
            acceptances: acceptances.map((acceptance) => ({
                id: acceptance.id,
                quoteId: acceptance.quoteId,
                revisionId: acceptance.revisionId,
                agreementAt: acceptance.agreementAt?.toISOString() ?? null,
                recordedAt: acceptance.recordedAt.toISOString(),
                recordedByUserId: acceptance.recordedByUserId,
                suppliedByName: acceptance.suppliedByName,
                suppliedByContactId: acceptance.suppliedByContactId,
                channel: acceptance.channel,
                externalReference: acceptance.externalReference,
                withdrawnAt: acceptance.withdrawnAt?.toISOString() ?? null,
                withdrawalReason: acceptance.withdrawalReason,
            })),
            history: history.map((entry) => ({
                id: entry.id,
                quoteId: entry.quoteId,
                version: entry.version,
                kind: entry.kind,
                revisionId: entry.revisionId,
                acceptanceId: entry.acceptanceId,
                reason: entry.reason,
                context: entry.context,
                recordedAt: entry.recordedAt.toISOString(),
                recordedByUserId: entry.recordedByUserId,
            })),
        });
    }

    list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: QuoteListQuery,
    ): Promise<QuoteListResponse> {
        let cursor: z.infer<typeof cursorSchema> | undefined;
        if (query.cursor) {
            try {
                cursor = cursorSchema.parse(
                    JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
                );
            } catch {
                throw new ContractException("INVALID_QUOTE_CURSOR", 400);
            }
            if (
                cursor.status !== (query.status ?? null) ||
                cursor.requestId !== (query.requestId ?? null) ||
                cursor.customerPartyId !== (query.customerPartyId ?? null) ||
                (cursor.searchFingerprint ?? searchFingerprint({ limit: query.limit })) !==
                    searchFingerprint(query)
            )
                throw new ContractException("INVALID_QUOTE_CURSOR", 400);
        }
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["quotations.read"],
            async (tx) => {
                const pattern = query.q ? `%${query.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
                const matchingLine = (assetId?: string, search?: string) =>
                    exists(
                        tx
                            .select({ id: quoteRevisionLines.id })
                            .from(quoteRevisionLines)
                            .innerJoin(
                                quoteRevisions,
                                and(
                                    eq(
                                        quoteRevisions.organizationId,
                                        quoteRevisionLines.organizationId,
                                    ),
                                    eq(quoteRevisions.id, quoteRevisionLines.revisionId),
                                ),
                            )
                            .where(
                                and(
                                    eq(quoteRevisionLines.organizationId, organizationId),
                                    eq(quoteRevisions.quoteId, quotes.id),
                                    assetId ? eq(quoteRevisionLines.assetId, assetId) : undefined,
                                    search
                                        ? ilike(quoteRevisionLines.description, search)
                                        : undefined,
                                ),
                            ),
                    );
                const instant = cursor ? sql`${cursor.createdAt}::timestamptz` : undefined;
                const rows = await tx
                    .select({
                        ...getTableColumns(quotes),
                        createdAtExact: sql<string>`to_char(${quotes.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
                        activeAcceptanceId: quoteAcceptances.id,
                    })
                    .from(quotes)
                    .leftJoin(
                        quoteAcceptances,
                        and(
                            eq(quoteAcceptances.organizationId, quotes.organizationId),
                            eq(quoteAcceptances.quoteId, quotes.id),
                            sql`${quoteAcceptances.withdrawnAt} IS NULL`,
                        ),
                    )
                    .where(
                        and(
                            eq(quotes.organizationId, organizationId),
                            query.status ? eq(quotes.status, query.status) : undefined,
                            query.requestId ? eq(quotes.requestId, query.requestId) : undefined,
                            query.customerPartyId
                                ? eq(quotes.customerPartyId, query.customerPartyId)
                                : undefined,
                            query.siteId
                                ? exists(
                                      tx
                                          .select({ id: serviceRequests.id })
                                          .from(serviceRequests)
                                          .where(
                                              and(
                                                  eq(
                                                      serviceRequests.organizationId,
                                                      organizationId,
                                                  ),
                                                  eq(serviceRequests.id, quotes.requestId),
                                                  eq(serviceRequests.siteId, query.siteId),
                                              ),
                                          ),
                                  )
                                : undefined,
                            query.assetId ? matchingLine(query.assetId) : undefined,
                            pattern
                                ? or(
                                      ilike(quotes.reference, pattern),
                                      matchingLine(undefined, pattern),
                                  )
                                : undefined,
                            query.createdFrom
                                ? gte(quotes.createdAt, new Date(query.createdFrom))
                                : undefined,
                            query.createdTo
                                ? lte(quotes.createdAt, new Date(query.createdTo))
                                : undefined,
                            instant
                                ? or(
                                      (query.sort === "oldest" ? gt : lt)(
                                          quotes.createdAt,
                                          instant,
                                      ),
                                      and(
                                          eq(quotes.createdAt, instant),
                                          (query.sort === "oldest" ? gt : lt)(
                                              quotes.id,
                                              cursor!.id,
                                          ),
                                      ),
                                  )
                                : undefined,
                        ),
                    )
                    .orderBy(
                        (query.sort === "oldest" ? asc : desc)(quotes.createdAt),
                        (query.sort === "oldest" ? asc : desc)(quotes.id),
                    )
                    .limit(query.limit + 1);
                const page = rows.slice(0, query.limit);
                const last = page.at(-1);
                return quoteListResponseSchema.parse({
                    data: page.map((row) => summary(row, row.activeAcceptanceId)),
                    nextCursor:
                        rows.length > query.limit && last
                            ? Buffer.from(
                                  JSON.stringify({
                                      createdAt: last.createdAtExact,
                                      id: last.id,
                                      status: query.status ?? null,
                                      requestId: query.requestId ?? null,
                                      customerPartyId: query.customerPartyId ?? null,
                                      searchFingerprint: searchFingerprint(query),
                                  }),
                              ).toString("base64url")
                            : null,
                });
            },
        );
    }
}
