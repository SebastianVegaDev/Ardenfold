import {
    technicalQueueResponseSchema,
    type TechnicalQueueQuery,
    type TechnicalQueueResponse,
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
    assetId: z.uuid().nullable(),
});

type QueueRow = {
    subject_id: string;
    execution_id: string | null;
    revision_id: string | null;
    work_order_id: string;
    work_item_id: string;
    status: string;
    occurred_at: Date | string;
    occurred_at_exact: string;
    customer_party_id: string;
    customer_name: string;
    customer_status: "active" | "archived";
    site_id: string;
    asset_id: string | null;
    asset_name: string | null;
    asset_status: "active" | "archived" | null;
};

function source(kind: TechnicalQueueQuery["kind"], organizationId: string): SQL {
    if (kind === "ready_to_execute")
        return sql`
        SELECT wi.id subject_id, NULL::uuid execution_id, NULL::uuid revision_id,
            wo.id work_order_id, wi.id work_item_id, wi.status::text status,
            wi.updated_at occurred_at, wo.customer_party_id, p.display_name customer_name,
            p.status::text customer_status, wo.site_id,
            wi.asset_id, a.display_name asset_name, a.status::text asset_status
        FROM work_items wi
        JOIN work_orders wo ON wo.organization_id = wi.organization_id AND wo.id = wi.work_order_id
        JOIN parties p ON p.organization_id = wo.organization_id AND p.id = wo.customer_party_id
        LEFT JOIN assets a ON a.organization_id = wi.organization_id AND a.id = wi.asset_id
        WHERE wi.organization_id = ${organizationId} AND wi.status = 'ready'
          AND wo.status = 'ready'
          AND NOT EXISTS (SELECT 1 FROM technical_executions e
            WHERE e.organization_id = wi.organization_id AND e.work_item_id = wi.id)`;

    if (kind === "approved")
        return sql`
        SELECT ap.id subject_id, e.id execution_id, rev.id revision_id,
            wo.id work_order_id, e.work_item_id, ap.outcome::text status,
            ap.decided_at occurred_at, wo.customer_party_id, p.display_name customer_name,
            p.status::text customer_status, e.site_id_at_start site_id,
            e.target_asset_id_at_start asset_id, a.display_name asset_name,
            a.status::text asset_status
        FROM technical_approvals ap
        JOIN technical_executions e ON e.organization_id = ap.organization_id AND e.id = ap.execution_id
        JOIN execution_revisions rev ON rev.organization_id = ap.organization_id AND rev.id = ap.revision_id
        JOIN work_orders wo ON wo.organization_id = e.organization_id AND wo.id = e.work_order_id
        JOIN parties p ON p.organization_id = wo.organization_id AND p.id = wo.customer_party_id
        LEFT JOIN assets a ON a.organization_id = e.organization_id AND a.id = e.target_asset_id_at_start
        WHERE ap.organization_id = ${organizationId} AND ap.outcome = 'approved'
          AND e.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM execution_revisions later
              WHERE later.organization_id = rev.organization_id
                AND later.execution_id = rev.execution_id
                AND later.revision_number > rev.revision_number
                AND later.status <> 'discarded')`;

    const predicate =
        kind === "in_progress"
            ? sql`e.status = 'active' AND rev.status = 'draft'`
            : kind === "awaiting_review"
              ? sql`e.status = 'active' AND rev.status = 'submitted' AND review.id IS NULL`
              : kind === "changes_requested"
                ? sql`e.status = 'active' AND review.outcome IN ('changes_requested', 'rejected')`
                : sql`e.status = 'active' AND review.outcome = 'accepted' AND approval.id IS NULL`;
    const subject =
        kind === "in_progress"
            ? sql`e.id`
            : kind === "awaiting_review"
              ? sql`rev.id`
              : sql`review.id`;
    const occurred =
        kind === "in_progress"
            ? sql`e.started_at`
            : kind === "awaiting_review"
              ? sql`rev.submitted_at`
              : sql`review.decided_at`;
    const status =
        kind === "in_progress"
            ? sql`rev.status::text`
            : kind === "awaiting_review"
              ? sql`rev.status::text`
              : sql`review.outcome::text`;
    return sql`
        SELECT ${subject} subject_id, e.id execution_id, rev.id revision_id,
            wo.id work_order_id, e.work_item_id, ${status} status,
            ${occurred} occurred_at, wo.customer_party_id, p.display_name customer_name,
            p.status::text customer_status, e.site_id_at_start site_id,
            e.target_asset_id_at_start asset_id, a.display_name asset_name,
            a.status::text asset_status
        FROM technical_executions e
        JOIN LATERAL (SELECT * FROM execution_revisions candidate
            WHERE candidate.organization_id = e.organization_id AND candidate.execution_id = e.id
            ORDER BY candidate.revision_number DESC LIMIT 1) rev ON TRUE
        LEFT JOIN technical_reviews review ON review.organization_id = rev.organization_id
            AND review.revision_id = rev.id
        LEFT JOIN technical_approvals approval ON approval.organization_id = rev.organization_id
            AND approval.revision_id = rev.id
        JOIN work_orders wo ON wo.organization_id = e.organization_id AND wo.id = e.work_order_id
        JOIN parties p ON p.organization_id = wo.organization_id AND p.id = wo.customer_party_id
        LEFT JOIN assets a ON a.organization_id = e.organization_id AND a.id = e.target_asset_id_at_start
        WHERE e.organization_id = ${organizationId} AND ${predicate}`;
}

@Injectable()
export class TechnicalQueuesService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: TechnicalQueueQuery,
    ): Promise<TechnicalQueueResponse> {
        let cursor: z.infer<typeof cursorSchema> | undefined;
        if (query.cursor) {
            try {
                cursor = cursorSchema.parse(
                    JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
                );
            } catch {
                throw new ContractException("INVALID_CURSOR", 400);
            }
            if (
                cursor.kind !== query.kind ||
                cursor.customerPartyId !== (query.customerPartyId ?? null) ||
                cursor.siteId !== (query.siteId ?? null) ||
                cursor.assetId !== (query.assetId ?? null)
            )
                throw new ContractException("INVALID_CURSOR", 400);
        }
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.read", "work_orders.read", "parties.read", "assets.read"],
            async (tx) => {
                const rows = await tx.execute<QueueRow>(sql`
                    SELECT candidate.*,
                        to_char(candidate.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') occurred_at_exact
                    FROM (${source(query.kind, organizationId)}) candidate
                    WHERE (${query.customerPartyId ?? null}::uuid IS NULL OR candidate.customer_party_id = ${query.customerPartyId ?? null}::uuid)
                      AND (${query.siteId ?? null}::uuid IS NULL OR candidate.site_id = ${query.siteId ?? null}::uuid)
                      AND (${query.assetId ?? null}::uuid IS NULL OR candidate.asset_id = ${query.assetId ?? null}::uuid)
                      ${cursor ? sql`AND (candidate.occurred_at, candidate.subject_id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : sql``}
                    ORDER BY candidate.occurred_at DESC, candidate.subject_id DESC
                    LIMIT ${query.limit + 1}`);
                const page = rows.rows.slice(0, query.limit);
                const last = page.at(-1);
                return technicalQueueResponseSchema.parse({
                    data: page.map((row) => ({
                        subjectId: row.subject_id,
                        executionId: row.execution_id,
                        revisionId: row.revision_id,
                        workOrderId: row.work_order_id,
                        workItemId: row.work_item_id,
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
                    })),
                    nextCursor:
                        rows.rows.length > query.limit && last
                            ? Buffer.from(
                                  JSON.stringify({
                                      at: last.occurred_at_exact,
                                      id: last.subject_id,
                                      kind: query.kind,
                                      customerPartyId: query.customerPartyId ?? null,
                                      siteId: query.siteId ?? null,
                                      assetId: query.assetId ?? null,
                                  }),
                                  "utf8",
                              ).toString("base64url")
                            : null,
                });
            },
        );
    }
}
