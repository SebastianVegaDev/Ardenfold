import { createHash } from "node:crypto";

import type { DecideTechnicalReview } from "@ardenfold/contracts";
import {
    executionHistoryEntries,
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
} from "./decision-context";

@Injectable()
export class TechnicalReviewService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    decide(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: DecideTechnicalReview,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_reviews.decide", "technical_executions.read"],
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
                    .from(technicalReviews)
                    .where(
                        and(
                            eq(technicalReviews.organizationId, organizationId),
                            eq(technicalReviews.idempotencyKey, input.idempotencyKey),
                        ),
                    );
                if (priorCommand) {
                    if (
                        priorCommand.payloadHash !== payloadHash ||
                        priorCommand.revisionId !== revisionId ||
                        priorCommand.reviewerUserId !== principal.user.id
                    )
                        throw new ContractException("IDEMPOTENCY_KEY_CONFLICT", 409);
                    return priorCommand;
                }
                requireCurrentSubmitted(
                    target,
                    input.expectedExecutionVersion,
                    input.expectedRevisionVersion,
                );
                const [existing] = await tx
                    .select({ id: technicalReviews.id })
                    .from(technicalReviews)
                    .where(
                        and(
                            eq(technicalReviews.organizationId, organizationId),
                            eq(technicalReviews.revisionId, revisionId),
                        ),
                    );
                if (existing) throw new ContractException("TECHNICAL_REVIEW_ALREADY_DECIDED", 409);
                const actor = await decisionActor(tx, organizationId, principal.user.id);
                await this.authorization.requireInTransaction(
                    tx,
                    principal.user.id,
                    organizationId,
                    ["technical_reviews.decide"],
                );
                const policy = await currentDecisionPolicy(tx, organizationId);
                const separatePerformer =
                    policy.requirePerformerReviewerSeparation ||
                    target.revision.requirePerformerReviewerSeparation === true;
                const separateApprover =
                    policy.requireReviewerApproverSeparation ||
                    target.revision.requireReviewerApproverSeparation === true;
                if (separatePerformer && target.revision.performerUserId === principal.user.id)
                    throw new ContractException("TECHNICAL_REVIEW_SEPARATION_REQUIRED", 403);
                const [review] = await tx
                    .insert(technicalReviews)
                    .values({
                        organizationId,
                        executionId,
                        revisionId,
                        outcome: input.outcome,
                        reviewerMembershipId: actor.id,
                        reviewerUserId: principal.user.id,
                        reviewerNameSnapshot: (
                            principal.user.displayName?.trim() || principal.user.primaryEmail
                        ).slice(0, 240),
                        reason: input.reason,
                        notes: input.notes,
                        policyVersion: decisionPolicyVersion(separatePerformer, separateApprover),
                        idempotencyKey: input.idempotencyKey,
                        payloadHash,
                    })
                    .returning();
                if (!review) throw new Error("Review insertion did not return its record");
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
                    kind: "review_decided",
                    snapshot: { reviewId: review.id, outcome: review.outcome },
                    recordedByUserId: principal.user.id,
                });
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "technical_review.decided",
                    resourceType: "technical_review",
                    resourceId: review.id,
                    metadata: { revisionId, outcome: review.outcome },
                });
                return review;
            },
        );
    }
}
