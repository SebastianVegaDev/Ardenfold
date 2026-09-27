import {
    requestTimelineResponseSchema,
    type RequestTimelineQuery,
    type RequestTimelineResponse,
} from "@ardenfold/contracts";
import { assets, parties, serviceRequests } from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";

const cursorSchema = z.strictObject({
    at: z.iso.datetime({ precision: 6 }),
    key: z.string().min(1).max(160),
    requestId: z.uuid(),
});
type TimelineRow = {
    event_key: string;
    source: "request" | "quote" | "work_order" | "work_item" | "receipt" | "asset_registry";
    kind: string;
    occurred_at: string | Date;
    occurred_at_exact: string;
    actor_user_id: string;
    request_id: string;
    quote_id: string | null;
    revision_id: string | null;
    acceptance_id: string | null;
    work_order_id: string | null;
    work_item_id: string | null;
    receipt_id: string | null;
    asset_id: string | null;
    reason: string | null;
    historical_details: Record<string, unknown> | null;
};

@Injectable()
export class RequestTimelineService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    get(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        requestId: string,
        query: RequestTimelineQuery,
    ): Promise<RequestTimelineResponse> {
        let cursor: z.infer<typeof cursorSchema> | undefined;
        if (query.cursor) {
            try {
                cursor = cursorSchema.parse(
                    JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
                );
            } catch {
                throw new ContractException("INVALID_REQUEST_TIMELINE_CURSOR", 400);
            }
            if (cursor.requestId !== requestId)
                throw new ContractException("INVALID_REQUEST_TIMELINE_CURSOR", 400);
        }
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [
                "service_requests.read",
                "quotations.read",
                "work_orders.read",
                "receipts.read",
                "parties.read",
                "assets.read",
            ],
            async (tx) => {
                const [basis] = await tx
                    .select({
                        id: serviceRequests.id,
                        summary: serviceRequests.summary,
                        status: serviceRequests.status,
                        customerId: parties.id,
                        customerName: parties.displayName,
                        customerStatus: parties.status,
                    })
                    .from(serviceRequests)
                    .innerJoin(
                        parties,
                        and(
                            eq(parties.organizationId, serviceRequests.organizationId),
                            eq(parties.id, serviceRequests.customerPartyId),
                        ),
                    )
                    .where(
                        and(
                            eq(serviceRequests.organizationId, organizationId),
                            eq(serviceRequests.id, requestId),
                        ),
                    );
                if (!basis) throw new ContractException("SERVICE_REQUEST_NOT_FOUND", 404);
                const result = await tx.execute<TimelineRow>(sql`
                    WITH events AS (
                        SELECT ('request:' || rh.request_id::text || ':' || rh.version::text) event_key,
                            'request'::text source, rh.kind::text kind, rh.recorded_at occurred_at,
                            rh.recorded_by_user_id actor_user_id, rh.request_id,
                            NULL::uuid quote_id, NULL::uuid revision_id, NULL::uuid acceptance_id,
                            NULL::uuid work_order_id, NULL::uuid work_item_id, NULL::uuid receipt_id,
                            NULL::uuid asset_id, rh.reason, rh.snapshot historical_details
                        FROM service_request_history_entries rh
                        WHERE rh.organization_id = ${organizationId} AND rh.request_id = ${requestId}
                        UNION ALL
                        SELECT ('quote:' || qh.id::text), 'quote', qh.kind::text, qh.recorded_at,
                            qh.recorded_by_user_id, q.request_id, q.id, qh.revision_id, qh.acceptance_id,
                            NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, qh.reason, qh.context
                        FROM quote_history_entries qh
                        JOIN quotes q ON q.organization_id = qh.organization_id AND q.id = qh.quote_id
                        WHERE qh.organization_id = ${organizationId} AND q.request_id = ${requestId}
                        UNION ALL
                        SELECT ('work_order:' || wh.id::text), 'work_order', wh.kind::text, wh.recorded_at,
                            wh.recorded_by_user_id, wo.request_id, wo.quote_id, wo.accepted_revision_id,
                            wo.acceptance_id, wo.id, NULL::uuid, NULL::uuid, NULL::uuid,
                            wh.reason, wh.snapshot
                        FROM work_order_history_entries wh
                        JOIN work_orders wo ON wo.organization_id = wh.organization_id AND wo.id = wh.work_order_id
                        WHERE wh.organization_id = ${organizationId} AND wo.request_id = ${requestId}
                        UNION ALL
                        SELECT ('work_item:' || ih.id::text), 'work_item', ih.kind::text, ih.recorded_at,
                            ih.recorded_by_user_id, wo.request_id, wo.quote_id, wo.accepted_revision_id,
                            wo.acceptance_id, wo.id, ih.work_item_id, NULL::uuid, wi.asset_id,
                            ih.reason, ih.snapshot
                        FROM work_item_history_entries ih
                        JOIN work_orders wo ON wo.organization_id = ih.organization_id AND wo.id = ih.work_order_id
                        JOIN work_items wi ON wi.organization_id = ih.organization_id AND wi.id = ih.work_item_id
                        WHERE ih.organization_id = ${organizationId} AND wo.request_id = ${requestId}
                        UNION ALL
                        SELECT ('receipt:' || rec.id::text), 'receipt', 'recorded', rec.recorded_at,
                            rec.recorded_by_user_id, wo.request_id, wo.quote_id, wo.accepted_revision_id,
                            wo.acceptance_id, wo.id, NULL::uuid, rec.id, rec.asset_id,
                            NULL::text, jsonb_build_object('receivedAt', rec.received_at, 'intakeDescription', rec.intake_description)
                        FROM receipts rec
                        JOIN work_orders wo ON wo.organization_id = rec.organization_id AND wo.id = rec.work_order_id
                        WHERE rec.organization_id = ${organizationId} AND wo.request_id = ${requestId}
                        UNION ALL
                        SELECT ('receipt_correction:' || corr.id::text), 'receipt', corr.kind::text, corr.corrected_at,
                            corr.corrected_by_user_id, wo.request_id, wo.quote_id, wo.accepted_revision_id,
                            wo.acceptance_id, wo.id, NULL::uuid, corr.receipt_id, rec.asset_id,
                            corr.reason, corr.after_snapshot
                        FROM receipt_corrections corr
                        JOIN work_orders wo ON wo.organization_id = corr.organization_id AND wo.id = corr.work_order_id
                        JOIN receipts rec ON rec.organization_id = corr.organization_id AND rec.id = corr.receipt_id
                        WHERE corr.organization_id = ${organizationId} AND wo.request_id = ${requestId}
                        UNION ALL
                        SELECT ('asset_registry:' || ah.id::text), 'asset_registry', ah.event::text, ah.occurred_at,
                            ah.actor_user_id, wo.request_id, wo.quote_id, wo.accepted_revision_id,
                            wo.acceptance_id, wo.id, NULL::uuid, rec.id, ah.asset_id,
                            NULL::text, ah.payload
                        FROM asset_history_entries ah
                        JOIN receipts rec ON rec.organization_id = ah.organization_id AND rec.id = ah.source_reference_id
                        JOIN work_orders wo ON wo.organization_id = rec.organization_id AND wo.id = rec.work_order_id
                        WHERE ah.organization_id = ${organizationId} AND ah.source = 'receipt'
                          AND wo.request_id = ${requestId}
                    )
                    SELECT events.*,
                        to_char(events.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') occurred_at_exact
                    FROM events
                    ${cursor ? sql`WHERE (events.occurred_at, events.event_key) < (${cursor.at}::timestamptz, ${cursor.key})` : sql``}
                    ORDER BY events.occurred_at DESC, events.event_key DESC
                    LIMIT ${query.limit + 1}`);
                const page = result.rows.slice(0, query.limit);
                const assetIds = [
                    ...new Set(
                        page
                            .map((event) => event.asset_id)
                            .filter((id): id is string => id !== null),
                    ),
                ];
                const currentAssets = assetIds.length
                    ? await tx
                          .select({
                              id: assets.id,
                              name: assets.displayName,
                              status: assets.status,
                          })
                          .from(assets)
                          .where(
                              and(
                                  eq(assets.organizationId, organizationId),
                                  inArray(assets.id, assetIds),
                              ),
                          )
                          .orderBy(assets.id)
                    : [];
                const last = page.at(-1);
                return requestTimelineResponseSchema.parse({
                    request: { id: basis.id, summary: basis.summary, status: basis.status },
                    currentCustomer: {
                        id: basis.customerId,
                        name: basis.customerName,
                        status: basis.customerStatus,
                    },
                    currentAssets,
                    data: page.map((event) => ({
                        key: event.event_key,
                        source: event.source,
                        kind: event.kind,
                        occurredAt: new Date(event.occurred_at).toISOString(),
                        actorUserId: event.actor_user_id,
                        requestId: event.request_id,
                        quoteId: event.quote_id,
                        revisionId: event.revision_id,
                        acceptanceId: event.acceptance_id,
                        workOrderId: event.work_order_id,
                        workItemId: event.work_item_id,
                        receiptId: event.receipt_id,
                        assetId: event.asset_id,
                        reason: event.reason,
                        historicalDetails: event.historical_details,
                    })),
                    nextCursor:
                        result.rows.length > query.limit && last
                            ? Buffer.from(
                                  JSON.stringify({
                                      at: last.occurred_at_exact,
                                      key: last.event_key,
                                      requestId,
                                  }),
                                  "utf8",
                              ).toString("base64url")
                            : null,
                });
            },
        );
    }
}
