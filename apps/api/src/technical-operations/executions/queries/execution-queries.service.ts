import {
    executionConditions,
    executionHistoryEntries,
    executionRevisions,
    executionSupportingAssets,
    technicalExecutions,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";
import type { TechnicalExecutionListQuery } from "@ardenfold/contracts";

const cursorSchema = z.strictObject({
    at: z.iso.datetime({ precision: 6 }),
    id: z.uuid(),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
});

type SearchRow = {
    id: string;
    version: number;
    status: string;
    work_order_id: string;
    work_item_id: string;
    started_at: Date | string;
    started_at_exact: string;
    site_id_at_start: string;
    site_name_at_start: string;
    target_asset_id_at_start: string | null;
    target_asset_label_at_start: string | null;
    scope_description_at_start: string;
    attempt_number: number;
    revision_id: string;
    revision_number: number;
    revision_status: string;
    performer_user_id: string | null;
    submitted_at: Date | string | null;
    review_id: string | null;
    review_outcome: string | null;
    reviewer_user_id: string | null;
    reviewed_at: Date | string | null;
    approval_id: string | null;
    approval_outcome: string | null;
    approver_user_id: string | null;
    approved_at: Date | string | null;
    customer_party_id: string;
    customer_name: string;
    customer_status: string;
    current_asset_name: string | null;
    current_asset_status: string | null;
};

@Injectable()
export class ExecutionQueriesService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: TechnicalExecutionListQuery,
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
                const rows = await tx.execute<SearchRow>(sql`
                    SELECT e.id, e.version, e.status::text status, e.work_order_id,
                        e.work_item_id, e.started_at,
                        to_char(e.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') started_at_exact,
                        e.site_id_at_start, e.site_name_at_start,
                        e.target_asset_id_at_start, e.target_asset_label_at_start,
                        e.scope_description_at_start, e.attempt_number,
                        rev.id revision_id, rev.revision_number, rev.status::text revision_status,
                        rev.performer_user_id, rev.submitted_at,
                        review.id review_id, review.outcome::text review_outcome,
                        review.reviewer_user_id, review.decided_at reviewed_at,
                        approval.id approval_id, approval.outcome::text approval_outcome,
                        approval.approver_user_id, approval.decided_at approved_at,
                        wo.customer_party_id, p.display_name customer_name,
                        p.status::text customer_status,
                        asset.display_name current_asset_name,
                        asset.status::text current_asset_status
                    FROM technical_executions e
                    JOIN LATERAL (SELECT * FROM execution_revisions candidate
                        WHERE candidate.organization_id = e.organization_id
                          AND candidate.execution_id = e.id
                        ORDER BY candidate.revision_number DESC LIMIT 1) rev ON TRUE
                    LEFT JOIN technical_reviews review ON review.organization_id = rev.organization_id
                        AND review.revision_id = rev.id
                    LEFT JOIN technical_approvals approval ON approval.organization_id = rev.organization_id
                        AND approval.revision_id = rev.id
                    JOIN work_orders wo ON wo.organization_id = e.organization_id AND wo.id = e.work_order_id
                    JOIN parties p ON p.organization_id = wo.organization_id AND p.id = wo.customer_party_id
                    LEFT JOIN assets asset ON asset.organization_id = e.organization_id
                        AND asset.id = e.target_asset_id_at_start
                    WHERE e.organization_id = ${organizationId}
                      AND (${query.workOrderId ?? null}::uuid IS NULL OR e.work_order_id = ${query.workOrderId ?? null}::uuid)
                      AND (${query.workItemId ?? null}::uuid IS NULL OR e.work_item_id = ${query.workItemId ?? null}::uuid)
                      AND (${query.customerPartyId ?? null}::uuid IS NULL OR wo.customer_party_id = ${query.customerPartyId ?? null}::uuid)
                      AND (${query.assetId ?? null}::uuid IS NULL OR e.target_asset_id_at_start = ${query.assetId ?? null}::uuid)
                      AND (${query.siteId ?? null}::uuid IS NULL OR e.site_id_at_start = ${query.siteId ?? null}::uuid)
                      AND (${query.performerUserId ?? null}::uuid IS NULL OR rev.performer_user_id = ${query.performerUserId ?? null}::uuid)
                      AND (${query.reviewerUserId ?? null}::uuid IS NULL OR review.reviewer_user_id = ${query.reviewerUserId ?? null}::uuid)
                      AND (${query.approverUserId ?? null}::uuid IS NULL OR approval.approver_user_id = ${query.approverUserId ?? null}::uuid)
                      AND (${query.status ?? null}::text IS NULL OR e.status::text = ${query.status ?? null}::text)
                      AND (${query.revisionStatus ?? null}::text IS NULL OR rev.status::text = ${query.revisionStatus ?? null}::text)
                      AND (${query.startedFrom ?? null}::timestamptz IS NULL OR e.started_at >= ${query.startedFrom ?? null}::timestamptz)
                      AND (${query.startedTo ?? null}::timestamptz IS NULL OR e.started_at <= ${query.startedTo ?? null}::timestamptz)
                      AND (${query.submittedFrom ?? null}::timestamptz IS NULL OR rev.submitted_at >= ${query.submittedFrom ?? null}::timestamptz)
                      AND (${query.submittedTo ?? null}::timestamptz IS NULL OR rev.submitted_at <= ${query.submittedTo ?? null}::timestamptz)
                      AND (${query.reviewedFrom ?? null}::timestamptz IS NULL OR review.decided_at >= ${query.reviewedFrom ?? null}::timestamptz)
                      AND (${query.reviewedTo ?? null}::timestamptz IS NULL OR review.decided_at <= ${query.reviewedTo ?? null}::timestamptz)
                      AND (${query.approvedFrom ?? null}::timestamptz IS NULL OR approval.decided_at >= ${query.approvedFrom ?? null}::timestamptz)
                      AND (${query.approvedTo ?? null}::timestamptz IS NULL OR approval.decided_at <= ${query.approvedTo ?? null}::timestamptz)
                      ${
                          cursor
                              ? query.sort === "newest"
                                  ? sql`AND (e.started_at, e.id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
                                  : sql`AND (e.started_at, e.id) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
                              : sql``
                      }
                    ORDER BY e.started_at ${query.sort === "newest" ? sql`DESC` : sql`ASC`},
                        e.id ${query.sort === "newest" ? sql`DESC` : sql`ASC`}
                    LIMIT ${limit + 1}`);
                const page = rows.rows.slice(0, limit);
                const last = page.at(-1);
                return {
                    data: page.map((row) => ({
                        execution: {
                            id: row.id,
                            version: row.version,
                            status: row.status,
                            workOrderId: row.work_order_id,
                            workItemId: row.work_item_id,
                            attemptNumber: row.attempt_number,
                            startedAt: new Date(row.started_at).toISOString(),
                            historicalScope: row.scope_description_at_start,
                            site: {
                                id: row.site_id_at_start,
                                historicalName: row.site_name_at_start,
                            },
                            targetAsset: row.target_asset_id_at_start
                                ? {
                                      id: row.target_asset_id_at_start,
                                      historicalLabel: row.target_asset_label_at_start,
                                      currentName: row.current_asset_name,
                                      currentStatus: row.current_asset_status,
                                  }
                                : null,
                        },
                        latestRevision: {
                            id: row.revision_id,
                            number: row.revision_number,
                            status: row.revision_status,
                            performerUserId: row.performer_user_id,
                            submittedAt: row.submitted_at
                                ? new Date(row.submitted_at).toISOString()
                                : null,
                        },
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
                        customer: {
                            id: row.customer_party_id,
                            currentName: row.customer_name,
                            currentStatus: row.customer_status,
                        },
                    })),
                    nextCursor:
                        rows.rows.length > limit && last
                            ? Buffer.from(
                                  JSON.stringify({
                                      at: last.started_at_exact,
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

    get(principal: AuthenticatedPrincipal, organizationId: string, executionId: string) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.read"],
            async (tx) => {
                const [execution] = await tx
                    .select()
                    .from(technicalExecutions)
                    .where(
                        and(
                            eq(technicalExecutions.organizationId, organizationId),
                            eq(technicalExecutions.id, executionId),
                        ),
                    );
                if (!execution) throw new ContractException("TECHNICAL_EXECUTION_NOT_FOUND", 404);
                const revisions = await tx
                    .select()
                    .from(executionRevisions)
                    .where(
                        and(
                            eq(executionRevisions.organizationId, organizationId),
                            eq(executionRevisions.executionId, executionId),
                        ),
                    )
                    .orderBy(executionRevisions.revisionNumber);
                const conditions = await tx
                    .select()
                    .from(executionConditions)
                    .where(
                        and(
                            eq(executionConditions.organizationId, organizationId),
                            eq(executionConditions.executionId, executionId),
                        ),
                    )
                    .orderBy(executionConditions.revisionId, executionConditions.position);
                const supportingAssets = await tx
                    .select()
                    .from(executionSupportingAssets)
                    .where(
                        and(
                            eq(executionSupportingAssets.organizationId, organizationId),
                            eq(executionSupportingAssets.executionId, executionId),
                        ),
                    )
                    .orderBy(
                        executionSupportingAssets.revisionId,
                        executionSupportingAssets.position,
                    );
                const history = await tx
                    .select()
                    .from(executionHistoryEntries)
                    .where(
                        and(
                            eq(executionHistoryEntries.organizationId, organizationId),
                            eq(executionHistoryEntries.executionId, executionId),
                        ),
                    )
                    .orderBy(executionHistoryEntries.executionVersion);
                return { execution, revisions, conditions, supportingAssets, history };
            },
        );
    }
}
import { createHash } from "node:crypto";
