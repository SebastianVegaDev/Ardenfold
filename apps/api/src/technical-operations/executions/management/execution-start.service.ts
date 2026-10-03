import { createHash } from "node:crypto";

import {
    executionHistoryEntries,
    executionRevisions,
    technicalApprovals,
    technicalExecutions,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { recordAuditEvent } from "../../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";
import { lockReadyTechnicalWorkItem } from "../../../service-management/work-orders/readiness/technical-execution-handoff";

export type StartTechnicalExecution = Readonly<{
    workOrderId: string;
    workItemId: string;
    expectedOrderVersion: number;
    expectedItemVersion: number;
    idempotencyKey: string;
}>;

@Injectable()
export class ExecutionStartService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    start(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: StartTechnicalExecution,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [
                "technical_executions.write",
                "technical_executions.read",
                "work_orders.read",
                "sites.read",
                "parties.read",
                "assets.read",
                "receipts.read",
            ],
            async (tx) => {
                const payloadHash = createHash("sha256")
                    .update(JSON.stringify(input))
                    .digest("hex");
                const [replay] = await tx
                    .select()
                    .from(technicalExecutions)
                    .where(
                        and(
                            eq(technicalExecutions.organizationId, organizationId),
                            eq(technicalExecutions.idempotencyKey, input.idempotencyKey),
                        ),
                    );
                if (replay) {
                    if (
                        replay.startedByUserId !== principal.user.id ||
                        replay.payloadHash !== payloadHash
                    )
                        throw new ContractException("IDEMPOTENCY_KEY_CONFLICT", 409);
                    const [revision] = await tx
                        .select()
                        .from(executionRevisions)
                        .where(
                            and(
                                eq(executionRevisions.organizationId, organizationId),
                                eq(executionRevisions.executionId, replay.id),
                                eq(executionRevisions.revisionNumber, 1),
                            ),
                        );
                    return { execution: replay, initialRevision: revision! };
                }

                const basis = await lockReadyTechnicalWorkItem(
                    tx,
                    organizationId,
                    input.workOrderId,
                    input.workItemId,
                    input.expectedOrderVersion,
                    input.expectedItemVersion,
                );
                const [previous] = await tx
                    .select()
                    .from(technicalExecutions)
                    .where(
                        and(
                            eq(technicalExecutions.organizationId, organizationId),
                            eq(technicalExecutions.workItemId, input.workItemId),
                        ),
                    )
                    .orderBy(desc(technicalExecutions.attemptNumber))
                    .limit(1);
                if (previous?.status === "active")
                    throw new ContractException("TECHNICAL_EXECUTION_ALREADY_ACTIVE", 409);
                if (previous) {
                    const [approved] = await tx
                        .select({ id: technicalApprovals.id })
                        .from(technicalApprovals)
                        .where(
                            and(
                                eq(technicalApprovals.organizationId, organizationId),
                                eq(technicalApprovals.executionId, previous.id),
                                eq(technicalApprovals.outcome, "approved"),
                            ),
                        )
                        .limit(1);
                    if (approved)
                        throw new ContractException("TECHNICAL_EXECUTION_ALREADY_APPROVED", 409);
                }

                const [execution] = await tx
                    .insert(technicalExecutions)
                    .values({
                        organizationId,
                        workOrderId: basis.order.id,
                        workItemId: basis.item.id,
                        attemptNumber: (previous?.attemptNumber ?? 0) + 1,
                        workItemVersionAtStart: basis.item.version,
                        acceptedRevisionIdAtStart: basis.order.acceptedRevisionId,
                        sourceRevisionLineIdAtStart: basis.item.sourceRevisionLineId,
                        itemNumberAtStart: basis.item.itemNumber,
                        scopeDescriptionAtStart: basis.item.scopeDescription,
                        allocatedQuantityAtStart: basis.item.allocatedQuantity,
                        allocatedUnitAtStart: basis.item.allocatedUnit,
                        siteIdAtStart: basis.order.siteId,
                        siteNameAtStart: basis.siteName,
                        targetAssetIdAtStart: basis.item.assetId,
                        targetAssetLabelAtStart: basis.targetAssetLabel,
                        idempotencyKey: input.idempotencyKey,
                        payloadHash,
                        startedByUserId: principal.user.id,
                    })
                    .returning();
                if (!execution) throw new Error("Execution insertion did not return its record");

                const [advanced] = await tx
                    .update(technicalExecutions)
                    .set({ version: 2, nextRevisionNumber: 2 })
                    .where(
                        and(
                            eq(technicalExecutions.organizationId, organizationId),
                            eq(technicalExecutions.id, execution.id),
                            eq(technicalExecutions.version, 1),
                        ),
                    )
                    .returning();
                if (!advanced) throw new ContractException("VERSION_CONFLICT", 409);
                const [initialRevision] = await tx
                    .insert(executionRevisions)
                    .values({
                        organizationId,
                        executionId: execution.id,
                        revisionNumber: 1,
                        createdByUserId: principal.user.id,
                        updatedByUserId: principal.user.id,
                    })
                    .returning();
                if (!initialRevision)
                    throw new Error("Revision insertion did not return its record");
                await tx.insert(executionHistoryEntries).values({
                    organizationId,
                    executionId: execution.id,
                    executionVersion: advanced.version,
                    revisionId: initialRevision.id,
                    kind: "started",
                    snapshot: {
                        workOrderId: basis.order.id,
                        workItemId: basis.item.id,
                        workItemVersion: basis.item.version,
                        acceptedRevisionId: basis.order.acceptedRevisionId,
                    },
                    recordedByUserId: principal.user.id,
                });
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "technical_execution.started",
                    resourceType: "technical_execution",
                    resourceId: execution.id,
                    metadata: { workItemId: basis.item.id, attemptNumber: advanced.attemptNumber },
                });
                return { execution: advanced, initialRevision };
            },
        );
    }
}
