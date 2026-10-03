import { createHash } from "node:crypto";

import type { DecideTechnicalApproval } from "@ardenfold/contracts";
import {
    executionHistoryEntries,
    technicalApprovals,
    technicalExecutions,
    technicalReviews,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { recordAuditEvent } from "../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";
import {
    currentDecisionPolicy,
    decisionActor,
    decisionPolicyVersion,
    lockDecisionTarget,
    requireCurrentSubmitted,
} from "../reviews/decision-context";

@Injectable()
export class TechnicalApprovalService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    decide(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: DecideTechnicalApproval,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_approvals.decide", "technical_executions.read"],
            async (tx) => {
                const target = await lockDecisionTarget(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                );
                const payloadHash = createHash("sha256")
                    .update(
                        JSON.stringify({
                            executionId,
                            revisionId,
                            actorUserId: principal.user.id,
                            ...input,
                        }),
                    )
                    .digest("hex");
                const [priorCommand] = await tx
                    .select()
                    .from(technicalApprovals)
                    .where(
                        and(
                            eq(technicalApprovals.organizationId, organizationId),
                            eq(technicalApprovals.idempotencyKey, input.idempotencyKey),
                        ),
                    );
                if (priorCommand) {
                    if (
                        priorCommand.payloadHash !== payloadHash ||
                        priorCommand.revisionId !== revisionId ||
                        priorCommand.approverUserId !== principal.user.id
                    )
                        throw new ContractException("IDEMPOTENCY_KEY_CONFLICT", 409);
                    return priorCommand;
                }
                requireCurrentSubmitted(
                    target,
                    input.expectedExecutionVersion,
                    input.expectedRevisionVersion,
                );
                const [review] = await tx
                    .select()
                    .from(technicalReviews)
                    .where(
                        and(
                            eq(technicalReviews.organizationId, organizationId),
                            eq(technicalReviews.executionId, executionId),
                            eq(technicalReviews.revisionId, revisionId),
                            eq(technicalReviews.id, input.reviewId),
                        ),
                    );
                if (!review || review.outcome !== "accepted")
                    throw new ContractException("TECHNICAL_ACCEPTED_REVIEW_REQUIRED", 409);
                const [existing] = await tx
                    .select({ id: technicalApprovals.id })
                    .from(technicalApprovals)
                    .where(
                        and(
                            eq(technicalApprovals.organizationId, organizationId),
                            eq(technicalApprovals.revisionId, revisionId),
                        ),
                    );
                if (existing)
                    throw new ContractException("TECHNICAL_APPROVAL_ALREADY_DECIDED", 409);
                const actor = await decisionActor(tx, organizationId, principal.user.id);
                await this.authorization.requireInTransaction(
                    tx,
                    principal.user.id,
                    organizationId,
                    ["technical_approvals.decide"],
                );
                const policy = await currentDecisionPolicy(tx, organizationId);
                const separatePerformer =
                    policy.requirePerformerReviewerSeparation ||
                    target.revision.requirePerformerReviewerSeparation === true;
                const separateApprover =
                    policy.requireReviewerApproverSeparation ||
                    target.revision.requireReviewerApproverSeparation === true;
                if (separateApprover && review.reviewerUserId === principal.user.id)
                    throw new ContractException("TECHNICAL_APPROVAL_SEPARATION_REQUIRED", 403);
                const [approval] = await tx
                    .insert(technicalApprovals)
                    .values({
                        organizationId,
                        executionId,
                        revisionId,
                        reviewId: review.id,
                        outcome: input.outcome,
                        approverMembershipId: actor.id,
                        approverUserId: principal.user.id,
                        approverNameSnapshot: (
                            principal.user.displayName?.trim() || principal.user.primaryEmail
                        ).slice(0, 240),
                        reason: input.reason,
                        notes: input.notes,
                        policyVersion: decisionPolicyVersion(separatePerformer, separateApprover),
                        idempotencyKey: input.idempotencyKey,
                        payloadHash,
                    })
                    .returning();
                if (!approval) throw new Error("Approval insertion did not return its record");
                const [advanced] = await tx
                    .update(technicalExecutions)
                    .set({
                        version: target.execution.version + 1,
                    })
                    .where(
                        and(
                            eq(technicalExecutions.id, executionId),
                            eq(technicalExecutions.version, target.execution.version),
                        ),
                    )
                    .returning();
                if (!advanced) throw new ContractException("VERSION_CONFLICT", 409);
                await tx.insert(executionHistoryEntries).values({
                    organizationId,
                    executionId,
                    executionVersion: advanced.version,
                    revisionId,
                    kind: "approval_decided",
                    snapshot: { approvalId: approval.id, outcome: approval.outcome },
                    recordedByUserId: principal.user.id,
                });
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "technical_approval.decided",
                    resourceType: "technical_approval",
                    resourceId: approval.id,
                    metadata: { revisionId, outcome: approval.outcome },
                });
                return approval;
            },
        );
    }
}
