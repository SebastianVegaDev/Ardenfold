import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    executionConditions,
    executionRevisions,
    executionSupportingAssets,
    technicalApprovals,
    technicalEvidence,
    technicalExecutions,
    technicalResultGroups,
    technicalResults,
    technicalReviews,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq, gt, isNull, ne } from "drizzle-orm";

import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";

@Injectable()
export class TechnicalPackageService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    private async content(
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
            );
        const [revision] = await tx
            .select()
            .from(executionRevisions)
            .where(
                and(
                    eq(executionRevisions.organizationId, organizationId),
                    eq(executionRevisions.executionId, executionId),
                    eq(executionRevisions.id, revisionId),
                ),
            );
        if (!execution || !revision)
            throw new ContractException("TECHNICAL_REVISION_NOT_FOUND", 404);
        const parent = and(
            eq(technicalResults.organizationId, organizationId),
            eq(technicalResults.revisionId, revisionId),
        );
        const conditions = await tx
            .select()
            .from(executionConditions)
            .where(
                and(
                    eq(executionConditions.organizationId, organizationId),
                    eq(executionConditions.revisionId, revisionId),
                ),
            )
            .orderBy(executionConditions.position);
        const supportingAssets = await tx
            .select()
            .from(executionSupportingAssets)
            .where(
                and(
                    eq(executionSupportingAssets.organizationId, organizationId),
                    eq(executionSupportingAssets.revisionId, revisionId),
                ),
            )
            .orderBy(executionSupportingAssets.position);
        const groups = await tx
            .select()
            .from(technicalResultGroups)
            .where(
                and(
                    eq(technicalResultGroups.organizationId, organizationId),
                    eq(technicalResultGroups.revisionId, revisionId),
                ),
            )
            .orderBy(technicalResultGroups.position);
        const results = await tx
            .select()
            .from(technicalResults)
            .where(parent)
            .orderBy(technicalResults.groupId, technicalResults.position);
        const evidence = await tx
            .select()
            .from(technicalEvidence)
            .where(
                and(
                    eq(technicalEvidence.organizationId, organizationId),
                    eq(technicalEvidence.revisionId, revisionId),
                    isNull(technicalEvidence.removedAt),
                ),
            )
            .orderBy(technicalEvidence.recordedAt);
        return { execution, revision, conditions, supportingAssets, groups, results, evidence };
    }

    reviewPackage(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.read", "technical_evidence.read"],
            async (tx) => {
                const content = await this.content(tx, organizationId, executionId, revisionId);
                if (content.revision.status !== "submitted")
                    throw new ContractException("TECHNICAL_DECISION_TARGET_INELIGIBLE", 409);
                return content;
            },
        );
    }

    approvedPackage(principal: AuthenticatedPrincipal, organizationId: string, approvalId: string) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.read", "technical_evidence.read"],
            async (tx) => {
                const [approval] = await tx
                    .select()
                    .from(technicalApprovals)
                    .where(
                        and(
                            eq(technicalApprovals.organizationId, organizationId),
                            eq(technicalApprovals.id, approvalId),
                            eq(technicalApprovals.outcome, "approved"),
                        ),
                    );
                if (!approval) throw new ContractException("TECHNICAL_APPROVAL_NOT_FOUND", 404);
                const [review] = await tx
                    .select()
                    .from(technicalReviews)
                    .where(
                        and(
                            eq(technicalReviews.organizationId, organizationId),
                            eq(technicalReviews.id, approval.reviewId),
                        ),
                    );
                if (!review || review.outcome !== "accepted")
                    throw new ContractException("TECHNICAL_APPROVAL_NOT_FOUND", 404);
                const content = await this.content(
                    tx,
                    organizationId,
                    approval.executionId,
                    approval.revisionId,
                );
                const [successor] = await tx
                    .select({ id: executionRevisions.id })
                    .from(executionRevisions)
                    .where(
                        and(
                            eq(executionRevisions.organizationId, organizationId),
                            eq(executionRevisions.executionId, approval.executionId),
                            gt(executionRevisions.revisionNumber, content.revision.revisionNumber),
                            ne(executionRevisions.status, "discarded"),
                        ),
                    )
                    .limit(1);
                return {
                    ...content,
                    review,
                    approval,
                    applicable: content.execution.status === "active" && !successor,
                };
            },
        );
    }
}
