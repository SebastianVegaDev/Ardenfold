import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    executionRevisions,
    organizationMemberships,
    organizations,
    technicalExecutions,
} from "@ardenfold/database/schema";
import { and, eq } from "drizzle-orm";

import { ContractException } from "../../http/contracts";
import { lockMembershipDecision } from "../../auth/memberships/membership-decision-lock";

export async function lockDecisionTarget(
    tx: ArdenfoldTransaction,
    organizationId: string,
    executionId: string,
    revisionId: string,
) {
    const [execution] = await tx
        .select()
        .from(technicalExecutions)
        .where(
            and(
                eq(technicalExecutions.organizationId, organizationId),
                eq(technicalExecutions.id, executionId),
            ),
        )
        .for("update");
    if (!execution) throw new ContractException("TECHNICAL_EXECUTION_NOT_FOUND", 404);
    const [revision] = await tx
        .select()
        .from(executionRevisions)
        .where(
            and(
                eq(executionRevisions.organizationId, organizationId),
                eq(executionRevisions.executionId, executionId),
                eq(executionRevisions.id, revisionId),
            ),
        )
        .for("update");
    if (!revision) throw new ContractException("TECHNICAL_REVISION_NOT_FOUND", 404);
    return { execution, revision };
}

export function requireCurrentSubmitted(
    target: Awaited<ReturnType<typeof lockDecisionTarget>>,
    expectedExecutionVersion: number,
    expectedRevisionVersion: number,
) {
    const { execution, revision } = target;
    if (
        execution.version !== expectedExecutionVersion ||
        revision.version !== expectedRevisionVersion
    )
        throw new ContractException("VERSION_CONFLICT", 409);
    if (
        execution.status !== "active" ||
        revision.status !== "submitted" ||
        execution.nextRevisionNumber !== revision.revisionNumber + 1
    )
        throw new ContractException("TECHNICAL_DECISION_TARGET_INELIGIBLE", 409);
}

export async function decisionActor(
    tx: ArdenfoldTransaction,
    organizationId: string,
    userId: string,
) {
    await lockMembershipDecision(tx, organizationId, userId);
    const [membership] = await tx
        .select()
        .from(organizationMemberships)
        .where(
            and(
                eq(organizationMemberships.organizationId, organizationId),
                eq(organizationMemberships.userId, userId),
                eq(organizationMemberships.status, "active"),
            ),
        );
    if (!membership) throw new ContractException("ORGANIZATION_ACCESS_DENIED", 403);
    return membership;
}

export async function currentDecisionPolicy(tx: ArdenfoldTransaction, organizationId: string) {
    const [policy] = await tx
        .select({
            requirePerformerReviewerSeparation: organizations.requirePerformerReviewerSeparation,
            requireReviewerApproverSeparation: organizations.requireReviewerApproverSeparation,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .for("share");
    if (!policy) throw new ContractException("ORGANIZATION_ACCESS_DENIED", 403);
    return policy;
}

export function decisionPolicyVersion(performerReviewer: boolean, reviewerApprover: boolean) {
    return `m5-v1/pr:${Number(performerReviewer)}/ra:${Number(reviewerApprover)}`;
}
