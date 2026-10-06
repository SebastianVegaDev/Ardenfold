import { createHash } from "node:crypto";

import type { TechnicalRevisionSearchQuery } from "@ardenfold/contracts";
import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";

const cursorSchema = z.strictObject({
    at: z.iso.datetime({ precision: 6 }),
    id: z.uuid(),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
});

type RevisionRow = {
    id: string;
    execution_id: string;
    revision_number: number;
    status: string;
    version: number;
    predecessor_revision_id: string | null;
    performer_user_id: string | null;
    method_name: string | null;
    created_at: Date | string;
    created_at_exact: string;
    submitted_at: Date | string | null;
    review_id: string | null;
    review_outcome: string | null;
    reviewer_user_id: string | null;
    reviewed_at: Date | string | null;
    approval_id: string | null;
    approval_outcome: string | null;
    approver_user_id: string | null;
    approved_at: Date | string | null;
    work_order_id: string;
    work_item_id: string;
    execution_status: string;
    site_id_at_start: string;
    site_name_at_start: string;
    target_asset_id_at_start: string | null;
    target_asset_label_at_start: string | null;
    customer_party_id: string;
    customer_name: string;
    customer_status: string;
    current_asset_name: string | null;
    current_asset_status: string | null;
};

@Injectable()
export class TechnicalRevisionSearchService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: TechnicalRevisionSearchQuery,
    ) {
        const { cursor: encodedCursor, limit, ...filters } = query;
        const signature = createHash("sha256").update(JSON.stringify(filters)).digest("hex");
        let cursor: z.infer<typeof cursorSchema> | undefined;
        if (encodedCursor) {
            try {
                cursor = cursorSchema.parse(
                    JSON.parse(Buffer.from(encodedCursor, "base64url").toString("utf8")),
                );
            } catch {
                throw new ContractException("INVALID_CURSOR", 400);
            }
            if (cursor.signature !== signature) throw new ContractException("INVALID_CURSOR", 400);
        }
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.read", "work_orders.read", "parties.read", "assets.read"],
            async (tx) => {
                const result = await tx.execute<RevisionRow>(sql`
                    SELECT rev.id, rev.execution_id, rev.revision_number,
                        rev.status::text status, rev.version, rev.predecessor_revision_id,
                        rev.performer_user_id, rev.method_name, rev.created_at,
                        to_char(rev.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at_exact,
                        rev.submitted_at, review.id review_id,
                        review.outcome::text review_outcome, review.reviewer_user_id,
                        review.decided_at reviewed_at, approval.id approval_id,
                        approval.outcome::text approval_outcome,
                        approval.approver_user_id, approval.decided_at approved_at,
                        e.work_order_id, e.work_item_id, e.status::text execution_status,
                        e.site_id_at_start, e.site_name_at_start,
                        e.target_asset_id_at_start, e.target_asset_label_at_start,
                        wo.customer_party_id, p.display_name customer_name,
                        p.status::text customer_status,
                        asset.display_name current_asset_name,
                        asset.status::text current_asset_status
                    FROM execution_revisions rev
                    JOIN technical_executions e ON e.organization_id = rev.organization_id
                        AND e.id = rev.execution_id
                    LEFT JOIN technical_reviews review ON review.organization_id = rev.organization_id
                        AND review.revision_id = rev.id
                    LEFT JOIN technical_approvals approval ON approval.organization_id = rev.organization_id
                        AND approval.revision_id = rev.id
                    JOIN work_orders wo ON wo.organization_id = e.organization_id AND wo.id = e.work_order_id
                    JOIN parties p ON p.organization_id = wo.organization_id AND p.id = wo.customer_party_id
                    LEFT JOIN assets asset ON asset.organization_id = e.organization_id
                        AND asset.id = e.target_asset_id_at_start
                    WHERE rev.organization_id = ${organizationId}
                      AND (${query.status ?? null}::text IS NULL OR rev.status::text = ${query.status ?? null}::text)
                      AND (${query.workOrderId ?? null}::uuid IS NULL OR e.work_order_id = ${query.workOrderId ?? null}::uuid)
                      AND (${query.workItemId ?? null}::uuid IS NULL OR e.work_item_id = ${query.workItemId ?? null}::uuid)
                      AND (${query.customerPartyId ?? null}::uuid IS NULL OR wo.customer_party_id = ${query.customerPartyId ?? null}::uuid)
                      AND (${query.assetId ?? null}::uuid IS NULL OR e.target_asset_id_at_start = ${query.assetId ?? null}::uuid)
                      AND (${query.siteId ?? null}::uuid IS NULL OR e.site_id_at_start = ${query.siteId ?? null}::uuid)
                      AND (${query.performerUserId ?? null}::uuid IS NULL OR rev.performer_user_id = ${query.performerUserId ?? null}::uuid)
                      AND (${query.reviewerUserId ?? null}::uuid IS NULL OR review.reviewer_user_id = ${query.reviewerUserId ?? null}::uuid)
                      AND (${query.approverUserId ?? null}::uuid IS NULL OR approval.approver_user_id = ${query.approverUserId ?? null}::uuid)
                      AND (${query.createdFrom ?? null}::timestamptz IS NULL OR rev.created_at >= ${query.createdFrom ?? null}::timestamptz)
                      AND (${query.createdTo ?? null}::timestamptz IS NULL OR rev.created_at <= ${query.createdTo ?? null}::timestamptz)
                      AND (${query.submittedFrom ?? null}::timestamptz IS NULL OR rev.submitted_at >= ${query.submittedFrom ?? null}::timestamptz)
                      AND (${query.submittedTo ?? null}::timestamptz IS NULL OR rev.submitted_at <= ${query.submittedTo ?? null}::timestamptz)
                      AND (${query.reviewedFrom ?? null}::timestamptz IS NULL OR review.decided_at >= ${query.reviewedFrom ?? null}::timestamptz)
                      AND (${query.reviewedTo ?? null}::timestamptz IS NULL OR review.decided_at <= ${query.reviewedTo ?? null}::timestamptz)
                      AND (${query.approvedFrom ?? null}::timestamptz IS NULL OR approval.decided_at >= ${query.approvedFrom ?? null}::timestamptz)
                      AND (${query.approvedTo ?? null}::timestamptz IS NULL OR approval.decided_at <= ${query.approvedTo ?? null}::timestamptz)
                      ${
                          cursor
                              ? query.sort === "newest"
                                  ? sql`AND (rev.created_at, rev.id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
                                  : sql`AND (rev.created_at, rev.id) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
                              : sql``
                      }
                    ORDER BY rev.created_at ${query.sort === "newest" ? sql`DESC` : sql`ASC`},
                        rev.id ${query.sort === "newest" ? sql`DESC` : sql`ASC`}
                    LIMIT ${limit + 1}`);
                const page = result.rows.slice(0, limit);
                const last = page.at(-1);
                return {
                    data: page.map((row) => ({
                        id: row.id,
                        executionId: row.execution_id,
                        number: row.revision_number,
                        status: row.status,
                        version: row.version,
                        predecessorRevisionId: row.predecessor_revision_id,
                        performerUserId: row.performer_user_id,
                        methodName: row.method_name,
                        createdAt: new Date(row.created_at).toISOString(),
                        submittedAt: row.submitted_at
                            ? new Date(row.submitted_at).toISOString()
                            : null,
                        review: row.review_id
                            ? {
                                  id: row.review_id,
                                  outcome: row.review_outcome,
                                  reviewerUserId: row.reviewer_user_id,
                                  decidedAt: row.reviewed_at
                                      ? new Date(row.reviewed_at).toISOString()
                                      : null,
                              }
                            : null,
                        approval: row.approval_id
                            ? {
                                  id: row.approval_id,
                                  outcome: row.approval_outcome,
                                  approverUserId: row.approver_user_id,
                                  decidedAt: row.approved_at
                                      ? new Date(row.approved_at).toISOString()
                                      : null,
                              }
                            : null,
                        work: {
                            workOrderId: row.work_order_id,
                            workItemId: row.work_item_id,
                            executionStatus: row.execution_status,
                            historicalSite: {
                                id: row.site_id_at_start,
                                name: row.site_name_at_start,
                            },
                            historicalTargetAsset: row.target_asset_id_at_start
                                ? {
                                      id: row.target_asset_id_at_start,
                                      label: row.target_asset_label_at_start,
                                  }
                                : null,
                            currentAsset: row.target_asset_id_at_start
                                ? {
                                      name: row.current_asset_name,
                                      status: row.current_asset_status,
                                  }
                                : null,
                            currentCustomer: {
                                id: row.customer_party_id,
                                name: row.customer_name,
                                status: row.customer_status,
                            },
                        },
                    })),
                    nextCursor:
                        result.rows.length > limit && last
                            ? Buffer.from(
                                  JSON.stringify({
                                      at: last.created_at_exact,
                                      id: last.id,
                                      signature,
                                  }),
                                  "utf8",
                              ).toString("base64url")
                            : null,
                };
            },
        );
    }
}
