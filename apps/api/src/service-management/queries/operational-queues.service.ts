import {
    operationalQueueResponseSchema,
    type OperationalQueueQuery,
    type OperationalQueueResponse,
} from "@ardenfold/contracts";
import { Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";

const cursorSchema = z.strictObject({
    at: z.iso.datetime({ precision: 6 }),
    id: z.uuid(),
    kind: z.string(),
    customerPartyId: z.uuid().nullable(),
    siteId: z.uuid().nullable(),
});

type QueueRow = {
    subject_id: string;
    subject_type: "request" | "quote" | "acceptance" | "work_order" | "work_item";
    request_id: string;
    quote_id: string | null;
    revision_id: string | null;
    acceptance_id: string | null;
    work_order_id: string | null;
    work_item_id: string | null;
    reference: string;
    title: string;
    status: string;
    occurred_at: string | Date;
    occurred_at_exact: string;
    customer_party_id: string;
    customer_name: string;
    customer_status: "active" | "archived";
    site_id: string | null;
    asset_id: string | null;
    asset_name: string | null;
    asset_status: "active" | "archived" | null;
    receipt_status: "none" | "pending" | "applied" | "not_required" | null;
};

function itemSource(organizationId: string, intakeOnly: boolean): SQL {
    return sql`
        SELECT wi.id subject_id, 'work_item'::text subject_type, wo.request_id,
            wo.quote_id, wo.accepted_revision_id revision_id, wo.acceptance_id,
            wo.id work_order_id, wi.id work_item_id,
            wo.reference::text reference, wi.scope_description::text title, wi.status::text status,
            wi.created_at occurred_at, wo.customer_party_id, p.display_name customer_name,
            p.status::text customer_status, wo.site_id,
            wi.asset_id, asset.display_name asset_name, asset.status::text asset_status,
            CASE WHEN wi.service_mode = 'physical_intake'
              THEN COALESCE(intake.custody_status::text, 'none') ELSE NULL END receipt_status
        FROM work_items wi
        JOIN work_orders wo ON wo.organization_id = wi.organization_id AND wo.id = wi.work_order_id
        JOIN parties p ON p.organization_id = wo.organization_id AND p.id = wo.customer_party_id
        LEFT JOIN assets asset ON asset.organization_id = wi.organization_id AND asset.id = wi.asset_id
        LEFT JOIN LATERAL (
            SELECT receipt.custody_status FROM receipt_items ri
            JOIN receipts receipt ON receipt.organization_id = ri.organization_id
              AND receipt.work_order_id = ri.work_order_id AND receipt.id = ri.receipt_id
            WHERE ri.organization_id = wi.organization_id AND ri.work_item_id = wi.id
              AND receipt.asset_id IS NOT DISTINCT FROM wi.asset_id AND receipt.voided_at IS NULL
            ORDER BY receipt.received_at DESC, receipt.id DESC LIMIT 1
        ) intake ON TRUE
        WHERE wi.organization_id = ${organizationId} AND wi.status = 'planned'
          AND wo.status <> 'cancelled'
          ${intakeOnly ? sql`AND wi.service_mode = 'physical_intake' AND (intake.custody_status IS NULL OR intake.custody_status = 'pending')` : sql``}`;
}

// Each source is a single, purpose-built query for one workflow state.
function queueSource(kind: OperationalQueueQuery["kind"], organizationId: string): SQL {
    switch (kind) {
        case "commercial_follow_up":
            return sql`
                SELECT r.id subject_id, 'request'::text subject_type, r.id request_id,
                    NULL::uuid quote_id, NULL::uuid revision_id, NULL::uuid acceptance_id,
                    NULL::uuid work_order_id, NULL::uuid work_item_id,
                    r.summary::text reference, r.summary::text title, r.status::text status,
                    r.created_at occurred_at, r.customer_party_id, p.display_name customer_name,
                    p.status::text customer_status, r.site_id,
                    NULL::uuid asset_id, NULL::text asset_name, NULL::text asset_status,
                    NULL::text receipt_status
                FROM service_requests r
                JOIN parties p ON p.organization_id = r.organization_id AND p.id = r.customer_party_id
                WHERE r.organization_id = ${organizationId} AND r.status = 'active'
                  AND NOT EXISTS (
                    SELECT 1 FROM quotes q WHERE q.organization_id = r.organization_id
                      AND q.request_id = r.id AND q.status IN ('open', 'accepted')
                  )`;
        case "awaiting_customer":
            return sql`
                SELECT q.id subject_id, 'quote'::text subject_type, q.request_id,
                    q.id quote_id, rev.id revision_id, NULL::uuid acceptance_id,
                    NULL::uuid work_order_id, NULL::uuid work_item_id,
                    q.reference::text reference, r.summary::text title, rev.status::text status,
                    rev.issued_at occurred_at, q.customer_party_id, p.display_name customer_name,
                    p.status::text customer_status, r.site_id,
                    NULL::uuid asset_id, NULL::text asset_name, NULL::text asset_status,
                    NULL::text receipt_status
                FROM quotes q
                JOIN quote_revisions rev ON rev.organization_id = q.organization_id
                  AND rev.quote_id = q.id AND rev.status = 'offered'
                  AND (rev.valid_until IS NULL OR rev.valid_until > now())
                JOIN service_requests r ON r.organization_id = q.organization_id AND r.id = q.request_id
                JOIN parties p ON p.organization_id = q.organization_id AND p.id = q.customer_party_id
                WHERE q.organization_id = ${organizationId} AND q.status = 'open'`;
        case "accepted_unoperationalized":
            return sql`
                SELECT a.id subject_id, 'acceptance'::text subject_type, q.request_id,
                    q.id quote_id, a.revision_id, a.id acceptance_id,
                    NULL::uuid work_order_id, NULL::uuid work_item_id,
                    q.reference::text reference, r.summary::text title, q.status::text status,
                    a.recorded_at occurred_at, q.customer_party_id, p.display_name customer_name,
                    p.status::text customer_status, r.site_id,
                    NULL::uuid asset_id, NULL::text asset_name, NULL::text asset_status,
                    NULL::text receipt_status
                FROM quote_acceptances a
                JOIN quotes q ON q.organization_id = a.organization_id AND q.id = a.quote_id
                JOIN service_requests r ON r.organization_id = q.organization_id AND r.id = q.request_id
                JOIN parties p ON p.organization_id = q.organization_id AND p.id = q.customer_party_id
                WHERE a.organization_id = ${organizationId} AND a.withdrawn_at IS NULL
                  AND q.status = 'accepted'
                  AND NOT EXISTS (
                    SELECT 1 FROM work_orders wo WHERE wo.organization_id = a.organization_id
                      AND wo.acceptance_id = a.id
                  )`;
        case "active_work":
            return sql`
                SELECT wo.id subject_id, 'work_order'::text subject_type, wo.request_id,
                    wo.quote_id, wo.accepted_revision_id revision_id, wo.acceptance_id,
                    wo.id work_order_id, NULL::uuid work_item_id,
                    wo.reference::text reference, r.summary::text title, wo.status::text status,
                    wo.created_at occurred_at, wo.customer_party_id, p.display_name customer_name,
                    p.status::text customer_status, wo.site_id,
                    NULL::uuid asset_id, NULL::text asset_name, NULL::text asset_status,
                    NULL::text receipt_status
                FROM work_orders wo
                JOIN service_requests r ON r.organization_id = wo.organization_id AND r.id = wo.request_id
                JOIN parties p ON p.organization_id = wo.organization_id AND p.id = wo.customer_party_id
                WHERE wo.organization_id = ${organizationId} AND wo.status <> 'cancelled'`;
        case "items_not_ready":
            return itemSource(organizationId, false);
        case "intake_needed":
            return itemSource(organizationId, true);
    }
}

@Injectable()
export class OperationalQueuesService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: OperationalQueueQuery,
    ): Promise<OperationalQueueResponse> {
        let cursor: z.infer<typeof cursorSchema> | undefined;
        if (query.cursor) {
            try {
                cursor = cursorSchema.parse(
                    JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
                );
            } catch {
                throw new ContractException("INVALID_OPERATIONAL_QUEUE_CURSOR", 400);
            }
            if (
                cursor.kind !== query.kind ||
                cursor.customerPartyId !== (query.customerPartyId ?? null) ||
                cursor.siteId !== (query.siteId ?? null)
            )
                throw new ContractException("INVALID_OPERATIONAL_QUEUE_CURSOR", 400);
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
                const source = queueSource(query.kind, organizationId);
                const result = await tx.execute<QueueRow>(sql`
                    SELECT candidate.*,
                      to_char(candidate.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') occurred_at_exact
                    FROM (${source}) candidate
                    WHERE (${query.customerPartyId ?? null}::uuid IS NULL OR candidate.customer_party_id = ${query.customerPartyId ?? null}::uuid)
                      AND (${query.siteId ?? null}::uuid IS NULL OR candidate.site_id = ${query.siteId ?? null}::uuid)
                      ${cursor ? sql`AND (candidate.occurred_at, candidate.subject_id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : sql``}
                    ORDER BY candidate.occurred_at DESC, candidate.subject_id DESC
                    LIMIT ${query.limit + 1}`);
                const page = result.rows.slice(0, query.limit);
                const last = page.at(-1);
                return operationalQueueResponseSchema.parse({
                    data: page.map((row) => ({
                        subjectId: row.subject_id,
                        subjectType: row.subject_type,
                        requestId: row.request_id,
                        quoteId: row.quote_id,
                        revisionId: row.revision_id,
                        acceptanceId: row.acceptance_id,
                        workOrderId: row.work_order_id,
                        workItemId: row.work_item_id,
                        reference: row.reference,
                        title: row.title,
                        status: row.status,
                        occurredAt: new Date(row.occurred_at).toISOString(),
                        customer: {
                            id: row.customer_party_id,
                            currentName: row.customer_name,
                            currentStatus: row.customer_status,
                        },
                        siteId: row.site_id,
                        asset:
                            row.asset_id && row.asset_name && row.asset_status
                                ? {
                                      id: row.asset_id,
                                      currentName: row.asset_name,
                                      currentStatus: row.asset_status,
                                  }
                                : null,
                        receiptStatus: row.receipt_status,
                    })),
                    nextCursor:
                        result.rows.length > query.limit && last
                            ? Buffer.from(
                                  JSON.stringify({
                                      at: last.occurred_at_exact,
                                      id: last.subject_id,
                                      kind: query.kind,
                                      customerPartyId: query.customerPartyId ?? null,
                                      siteId: query.siteId ?? null,
                                  }),
                                  "utf8",
                              ).toString("base64url")
                            : null,
                });
            },
        );
    }
}
