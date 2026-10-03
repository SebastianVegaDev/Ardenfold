import {
    executionConditions,
    executionHistoryEntries,
    executionRevisions,
    executionSupportingAssets,
    technicalExecutions,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";
import type { TechnicalExecutionListQuery } from "@ardenfold/contracts";

@Injectable()
export class ExecutionQueriesService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: TechnicalExecutionListQuery,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.read"],
            async (tx) => {
                const rows = await tx
                    .select()
                    .from(technicalExecutions)
                    .where(
                        and(
                            eq(technicalExecutions.organizationId, organizationId),
                            query.workItemId
                                ? eq(technicalExecutions.workItemId, query.workItemId)
                                : undefined,
                            query.status ? eq(technicalExecutions.status, query.status) : undefined,
                        ),
                    )
                    .orderBy(desc(technicalExecutions.startedAt), desc(technicalExecutions.id))
                    .limit(query.limit);
                return { data: rows };
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
