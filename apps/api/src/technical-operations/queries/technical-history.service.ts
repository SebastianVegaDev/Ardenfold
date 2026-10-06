import type { TechnicalHistoryQuery } from "@ardenfold/contracts";
import {
    technicalApprovals,
    technicalEvidence,
    technicalExecutions,
    technicalResults,
    technicalReviews,
    executionHistoryEntries,
    executionRevisions,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";

type CurrentWorkRow = {
    order_status: string;
    item_status: string;
    item_scope: string;
    customer_party_id: string;
    customer_name: string;
    customer_status: string;
    asset_id: string | null;
    asset_name: string | null;
    asset_status: string | null;
};

@Injectable()
export class TechnicalHistoryService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    get(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        query: TechnicalHistoryQuery,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [
                "technical_executions.read",
                "technical_evidence.read",
                "work_orders.read",
                "parties.read",
                "assets.read",
            ],
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
                const current = await tx.execute<CurrentWorkRow>(sql`
                    SELECT wo.status::text order_status, wi.status::text item_status,
                        wi.scope_description item_scope, wo.customer_party_id,
                        p.display_name customer_name, p.status::text customer_status,
                        wi.asset_id, a.display_name asset_name, a.status::text asset_status
                    FROM work_orders wo
                    JOIN work_items wi ON wi.organization_id = wo.organization_id
                        AND wi.work_order_id = wo.id AND wi.id = ${execution.workItemId}
                    JOIN parties p ON p.organization_id = wo.organization_id
                        AND p.id = wo.customer_party_id
                    LEFT JOIN assets a ON a.organization_id = wi.organization_id
                        AND a.id = wi.asset_id
                    WHERE wo.organization_id = ${organizationId} AND wo.id = ${execution.workOrderId}
                    LIMIT 1`);
                const rows = await tx
                    .select()
                    .from(executionHistoryEntries)
                    .where(
                        and(
                            eq(executionHistoryEntries.organizationId, organizationId),
                            eq(executionHistoryEntries.executionId, executionId),
                            gt(executionHistoryEntries.executionVersion, query.afterVersion),
                        ),
                    )
                    .orderBy(executionHistoryEntries.executionVersion)
                    .limit(query.limit + 1);
                const page = rows.slice(0, query.limit);
                const ids = [
                    ...new Set(page.flatMap((row) => (row.revisionId ? [row.revisionId] : []))),
                ];
                const revisions = ids.length
                    ? await tx
                          .select()
                          .from(executionRevisions)
                          .where(
                              and(
                                  eq(executionRevisions.organizationId, organizationId),
                                  eq(executionRevisions.executionId, executionId),
                                  inArray(executionRevisions.id, ids),
                              ),
                          )
                    : [];
                const results = ids.length
                    ? await tx
                          .select({
                              revisionId: technicalResults.revisionId,
                              value: count(),
                          })
                          .from(technicalResults)
                          .where(
                              and(
                                  eq(technicalResults.organizationId, organizationId),
                                  inArray(technicalResults.revisionId, ids),
                              ),
                          )
                          .groupBy(technicalResults.revisionId)
                    : [];
                const evidence = ids.length
                    ? await tx
                          .select({
                              revisionId: technicalEvidence.revisionId,
                              value: count(),
                          })
                          .from(technicalEvidence)
                          .where(
                              and(
                                  eq(technicalEvidence.organizationId, organizationId),
                                  inArray(technicalEvidence.revisionId, ids),
                                  isNull(technicalEvidence.removedAt),
                              ),
                          )
                          .groupBy(technicalEvidence.revisionId)
                    : [];
                const reviews = ids.length
                    ? await tx
                          .select()
                          .from(technicalReviews)
                          .where(
                              and(
                                  eq(technicalReviews.organizationId, organizationId),
                                  inArray(technicalReviews.revisionId, ids),
                              ),
                          )
                    : [];
                const approvals = ids.length
                    ? await tx
                          .select()
                          .from(technicalApprovals)
                          .where(
                              and(
                                  eq(technicalApprovals.organizationId, organizationId),
                                  inArray(technicalApprovals.revisionId, ids),
                              ),
                          )
                    : [];
                const revisionMap = new Map(revisions.map((row) => [row.id, row]));
                const resultMap = new Map(results.map((row) => [row.revisionId, row.value]));
                const evidenceMap = new Map(evidence.map((row) => [row.revisionId, row.value]));
                const reviewMap = new Map(reviews.map((row) => [row.revisionId, row]));
                const approvalMap = new Map(approvals.map((row) => [row.revisionId, row]));
                const work = current.rows[0];
                return {
                    execution: {
                        id: execution.id,
                        version: execution.version,
                        status: execution.status,
                        workOrderId: execution.workOrderId,
                        workItemId: execution.workItemId,
                        historicalScope: execution.scopeDescriptionAtStart,
                        historicalSite: {
                            id: execution.siteIdAtStart,
                            name: execution.siteNameAtStart,
                        },
                        historicalTargetAsset: execution.targetAssetIdAtStart
                            ? {
                                  id: execution.targetAssetIdAtStart,
                                  label: execution.targetAssetLabelAtStart,
                              }
                            : null,
                    },
                    currentWork: work
                        ? {
                              orderStatus: work.order_status,
                              itemStatus: work.item_status,
                              itemScope: work.item_scope,
                              customer: {
                                  id: work.customer_party_id,
                                  name: work.customer_name,
                                  status: work.customer_status,
                              },
                              asset: work.asset_id
                                  ? {
                                        id: work.asset_id,
                                        name: work.asset_name,
                                        status: work.asset_status,
                                    }
                                  : null,
                          }
                        : null,
                    events: page.map((entry) => {
                        const revision = entry.revisionId
                            ? revisionMap.get(entry.revisionId)
                            : undefined;
                        const review = entry.revisionId
                            ? reviewMap.get(entry.revisionId)
                            : undefined;
                        const approval = entry.revisionId
                            ? approvalMap.get(entry.revisionId)
                            : undefined;
                        return {
                            id: entry.id,
                            version: entry.executionVersion,
                            kind: entry.kind,
                            occurredAt: entry.recordedAt.toISOString(),
                            actorUserId: entry.recordedByUserId,
                            reason: entry.reason,
                            revisionCurrentState: revision
                                ? {
                                      id: revision.id,
                                      number: revision.revisionNumber,
                                      status: revision.status,
                                      predecessorRevisionId: revision.predecessorRevisionId,
                                      performerUserId: revision.performerUserId,
                                      resultCount: resultMap.get(revision.id) ?? 0,
                                      evidenceCount: evidenceMap.get(revision.id) ?? 0,
                                      review: review
                                          ? {
                                                id: review.id,
                                                outcome: review.outcome,
                                                reviewerUserId: review.reviewerUserId,
                                                decidedAt: review.decidedAt.toISOString(),
                                            }
                                          : null,
                                      approval: approval
                                          ? {
                                                id: approval.id,
                                                outcome: approval.outcome,
                                                approverUserId: approval.approverUserId,
                                                decidedAt: approval.decidedAt.toISOString(),
                                            }
                                          : null,
                                  }
                                : null,
                        };
                    }),
                    nextAfterVersion:
                        rows.length > query.limit ? page.at(-1)!.executionVersion : null,
                };
            },
        );
    }
}
