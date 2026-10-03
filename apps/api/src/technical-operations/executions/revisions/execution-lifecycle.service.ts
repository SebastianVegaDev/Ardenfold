import type {
    AbandonTechnicalExecution,
    CreateSuccessorRevision,
    DiscardExecutionDraft,
    EditExecutionDraft,
    SubmitExecutionRevision,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    assets,
    executionConditions,
    executionHistoryEntries,
    executionRevisions,
    executionSupportingAssets,
    organizationMemberships,
    organizationSites,
    organizations,
    technicalApprovals,
    technicalEvidence,
    technicalExecutions,
    technicalResults,
    technicalReviews,
    users,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { recordAuditEvent } from "../../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";

type Transaction = ArdenfoldTransaction;

@Injectable()
export class ExecutionLifecycleService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    private async lockExecution(tx: Transaction, organizationId: string, executionId: string) {
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
        return execution;
    }

    private async lockRevision(
        tx: Transaction,
        organizationId: string,
        executionId: string,
        revisionId: string,
    ) {
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
        return revision;
    }

    edit(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: EditExecutionDraft,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [
                "technical_executions.write",
                "technical_executions.read",
                "assets.read",
                "sites.read",
            ],
            async (tx) => {
                const execution = await this.lockExecution(tx, organizationId, executionId);
                const revision = await this.lockRevision(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                );
                if (execution.status !== "active" || revision.status !== "draft")
                    throw new ContractException("TECHNICAL_REVISION_NOT_EDITABLE", 409);
                if (revision.version !== input.expectedVersion)
                    throw new ContractException("VERSION_CONFLICT", 409);

                let performerNameSnapshot = revision.performerNameSnapshot;
                if (input.performerUserId !== undefined) {
                    performerNameSnapshot = null;
                    if (input.performerUserId) {
                        const [performer] = await tx
                            .select({
                                displayName: users.displayName,
                                email: users.primaryEmail,
                            })
                            .from(organizationMemberships)
                            .innerJoin(users, eq(users.id, organizationMemberships.userId))
                            .where(
                                and(
                                    eq(organizationMemberships.organizationId, organizationId),
                                    eq(organizationMemberships.userId, input.performerUserId),
                                    eq(organizationMemberships.status, "active"),
                                ),
                            )
                            .for("share");
                        if (!performer)
                            throw new ContractException("TECHNICAL_PERFORMER_INVALID", 404);
                        performerNameSnapshot = performer.displayName ?? performer.email;
                    }
                }
                if (input.performedAtSiteId) {
                    const [site] = await tx
                        .select({ id: organizationSites.id })
                        .from(organizationSites)
                        .where(
                            and(
                                eq(organizationSites.organizationId, organizationId),
                                eq(organizationSites.id, input.performedAtSiteId),
                                eq(organizationSites.isActive, true),
                            ),
                        )
                        .for("share");
                    if (!site) throw new ContractException("TECHNICAL_SITE_INVALID", 404);
                }

                const [updated] = await tx
                    .update(executionRevisions)
                    .set({
                        performerUserId:
                            input.performerUserId === undefined
                                ? revision.performerUserId
                                : input.performerUserId,
                        performerNameSnapshot,
                        methodName:
                            input.methodName === undefined ? revision.methodName : input.methodName,
                        methodIdentifier:
                            input.methodIdentifier === undefined
                                ? revision.methodIdentifier
                                : input.methodIdentifier,
                        methodVersion:
                            input.methodVersion === undefined
                                ? revision.methodVersion
                                : input.methodVersion,
                        performedStartedAt:
                            input.performedStartedAt === undefined
                                ? revision.performedStartedAt
                                : input.performedStartedAt
                                  ? new Date(input.performedStartedAt)
                                  : null,
                        performedEndedAt:
                            input.performedEndedAt === undefined
                                ? revision.performedEndedAt
                                : input.performedEndedAt
                                  ? new Date(input.performedEndedAt)
                                  : null,
                        performedAtSiteId:
                            input.performedAtSiteId === undefined
                                ? revision.performedAtSiteId
                                : input.performedAtSiteId,
                        performedLocationSnapshot:
                            input.performedLocationSnapshot === undefined
                                ? revision.performedLocationSnapshot
                                : input.performedLocationSnapshot,
                        technicianNotes:
                            input.technicianNotes === undefined
                                ? revision.technicianNotes
                                : input.technicianNotes,
                        version: revision.version + 1,
                        updatedByUserId: principal.user.id,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(executionRevisions.id, revision.id),
                            eq(executionRevisions.version, revision.version),
                        ),
                    )
                    .returning();
                if (!updated) throw new ContractException("VERSION_CONFLICT", 409);

                if (input.conditions !== undefined) {
                    await tx
                        .delete(executionConditions)
                        .where(
                            and(
                                eq(executionConditions.organizationId, organizationId),
                                eq(executionConditions.revisionId, revisionId),
                            ),
                        );
                    if (
                        new Set(input.conditions.map((row) => row.position)).size !==
                        input.conditions.length
                    )
                        throw new ContractException("TECHNICAL_CONDITION_ORDER_INVALID", 400);
                    if (input.conditions.length)
                        await tx.insert(executionConditions).values(
                            input.conditions.map((row) => ({
                                organizationId,
                                executionId,
                                revisionId,
                                position: row.position,
                                name: row.name,
                                decimalValue: row.decimalValue ?? null,
                                unitCode: row.unitCode ?? null,
                                textValue: row.textValue ?? null,
                                observedAt: row.observedAt ? new Date(row.observedAt) : null,
                            })),
                        );
                }
                if (input.supportingAssets !== undefined) {
                    if (
                        new Set(input.supportingAssets.map((row) => row.position)).size !==
                            input.supportingAssets.length ||
                        new Set(input.supportingAssets.map((row) => row.assetId)).size !==
                            input.supportingAssets.length
                    )
                        throw new ContractException(
                            "TECHNICAL_SUPPORTING_ASSET_ORDER_INVALID",
                            400,
                        );
                    const refs = [];
                    for (const row of input.supportingAssets) {
                        const [asset] = await tx
                            .select({ displayName: assets.displayName, status: assets.status })
                            .from(assets)
                            .where(
                                and(
                                    eq(assets.organizationId, organizationId),
                                    eq(assets.id, row.assetId),
                                ),
                            )
                            .for("share");
                        if (!asset || asset.status !== "active")
                            throw new ContractException("TECHNICAL_SUPPORTING_ASSET_INVALID", 404);
                        refs.push({
                            organizationId,
                            executionId,
                            revisionId,
                            assetId: row.assetId,
                            position: row.position,
                            use: row.use,
                            assetLabelSnapshot: asset.displayName,
                        });
                    }
                    await tx
                        .delete(executionSupportingAssets)
                        .where(
                            and(
                                eq(executionSupportingAssets.organizationId, organizationId),
                                eq(executionSupportingAssets.revisionId, revisionId),
                            ),
                        );
                    if (refs.length) await tx.insert(executionSupportingAssets).values(refs);
                }

                const [advanced] = await tx
                    .update(technicalExecutions)
                    .set({ version: execution.version + 1 })
                    .where(
                        and(
                            eq(technicalExecutions.id, execution.id),
                            eq(technicalExecutions.version, execution.version),
                        ),
                    )
                    .returning();
                if (!advanced) throw new ContractException("VERSION_CONFLICT", 409);
                await this.history(
                    tx,
                    organizationId,
                    advanced.id,
                    advanced.version,
                    updated.id,
                    "draft_edited",
                    { revisionVersion: updated.version },
                    principal.user.id,
                );
                await this.audit(
                    tx,
                    principal,
                    organizationId,
                    updated.id,
                    "technical_revision.edited",
                    updated.version,
                );
                return updated;
            },
        );
    }

    submit(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: SubmitExecutionRevision,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read", "technical_evidence.read"],
            async (tx) => {
                const execution = await this.lockExecution(tx, organizationId, executionId);
                const revision = await this.lockRevision(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                );
                const command = await tx
                    .select()
                    .from(executionHistoryEntries)
                    .where(
                        and(
                            eq(executionHistoryEntries.organizationId, organizationId),
                            eq(executionHistoryEntries.executionId, executionId),
                            eq(executionHistoryEntries.revisionId, revisionId),
                            eq(executionHistoryEntries.kind, "submitted"),
                        ),
                    )
                    .orderBy(desc(executionHistoryEntries.recordedAt))
                    .limit(1);
                if (
                    revision.status === "submitted" &&
                    command[0]?.snapshot &&
                    (command[0].snapshot as Record<string, unknown>).idempotencyKey ===
                        input.idempotencyKey &&
                    (command[0].snapshot as Record<string, unknown>).actorUserId ===
                        principal.user.id &&
                    (command[0].snapshot as Record<string, unknown>).expectedVersion ===
                        input.expectedVersion
                )
                    return revision;
                if (execution.status !== "active" || revision.status !== "draft")
                    throw new ContractException("TECHNICAL_REVISION_NOT_EDITABLE", 409);
                if (revision.version !== input.expectedVersion)
                    throw new ContractException("VERSION_CONFLICT", 409);
                if (!revision.performerUserId || !revision.methodName)
                    throw new ContractException("TECHNICAL_SUBMISSION_INCOMPLETE", 409);
                const [result] = await tx
                    .select({ id: technicalResults.id })
                    .from(technicalResults)
                    .where(
                        and(
                            eq(technicalResults.organizationId, organizationId),
                            eq(technicalResults.revisionId, revisionId),
                        ),
                    )
                    .limit(1);
                const [evidence] = await tx
                    .select({ id: technicalEvidence.id })
                    .from(technicalEvidence)
                    .where(
                        and(
                            eq(technicalEvidence.organizationId, organizationId),
                            eq(technicalEvidence.revisionId, revisionId),
                            isNull(technicalEvidence.removedAt),
                        ),
                    )
                    .limit(1);
                if (!result && !evidence)
                    throw new ContractException("TECHNICAL_SUBMISSION_EMPTY", 409);
                const [policy] = await tx
                    .select({
                        requirePerformerReviewerSeparation:
                            organizations.requirePerformerReviewerSeparation,
                        requireReviewerApproverSeparation:
                            organizations.requireReviewerApproverSeparation,
                    })
                    .from(organizations)
                    .where(eq(organizations.id, organizationId))
                    .for("share");
                if (!policy) throw new ContractException("ORGANIZATION_ACCESS_DENIED", 403);
                const [submitted] = await tx
                    .update(executionRevisions)
                    .set({
                        status: "submitted",
                        version: revision.version + 1,
                        submittedByUserId: principal.user.id,
                        submittedAt: new Date(),
                        ...policy,
                        updatedByUserId: principal.user.id,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(executionRevisions.id, revision.id),
                            eq(executionRevisions.version, revision.version),
                        ),
                    )
                    .returning();
                if (!submitted) throw new ContractException("VERSION_CONFLICT", 409);
                const [advanced] = await tx
                    .update(technicalExecutions)
                    .set({ version: execution.version + 1 })
                    .where(
                        and(
                            eq(technicalExecutions.id, execution.id),
                            eq(technicalExecutions.version, execution.version),
                        ),
                    )
                    .returning();
                if (!advanced) throw new ContractException("VERSION_CONFLICT", 409);
                await this.history(
                    tx,
                    organizationId,
                    execution.id,
                    advanced.version,
                    revision.id,
                    "submitted",
                    {
                        idempotencyKey: input.idempotencyKey,
                        actorUserId: principal.user.id,
                        expectedVersion: input.expectedVersion,
                    },
                    principal.user.id,
                );
                await this.audit(
                    tx,
                    principal,
                    organizationId,
                    revision.id,
                    "technical_revision.submitted",
                    submitted.version,
                );
                return submitted;
            },
        );
    }

    successor(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        input: CreateSuccessorRevision,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) => {
                const execution = await this.lockExecution(tx, organizationId, executionId);
                const [priorCommand] = await tx
                    .select()
                    .from(executionHistoryEntries)
                    .where(
                        and(
                            eq(executionHistoryEntries.organizationId, organizationId),
                            eq(executionHistoryEntries.executionId, executionId),
                            eq(executionHistoryEntries.kind, "successor_created"),
                            sql`${executionHistoryEntries.snapshot}->>'idempotencyKey' = ${input.idempotencyKey}`,
                        ),
                    )
                    .limit(1);
                if (priorCommand) {
                    const previous = priorCommand.snapshot as Record<string, unknown>;
                    if (
                        previous.actorUserId !== principal.user.id ||
                        previous.predecessorRevisionId !== input.predecessorRevisionId ||
                        previous.expectedExecutionVersion !== input.expectedExecutionVersion ||
                        previous.reason !== input.reason
                    )
                        throw new ContractException("IDEMPOTENCY_KEY_CONFLICT", 409);
                    const [replay] = await tx
                        .select()
                        .from(executionRevisions)
                        .where(
                            and(
                                eq(executionRevisions.organizationId, organizationId),
                                eq(executionRevisions.id, priorCommand.revisionId!),
                            ),
                        );
                    if (replay) return replay;
                }
                if (execution.status !== "active")
                    throw new ContractException("TECHNICAL_EXECUTION_INACTIVE", 409);
                if (execution.version !== input.expectedExecutionVersion)
                    throw new ContractException("VERSION_CONFLICT", 409);
                const predecessor = await this.lockRevision(
                    tx,
                    organizationId,
                    executionId,
                    input.predecessorRevisionId,
                );
                if (
                    (predecessor.status !== "submitted" && predecessor.status !== "discarded") ||
                    predecessor.revisionNumber !== execution.nextRevisionNumber - 1
                )
                    throw new ContractException("TECHNICAL_SUCCESSOR_INVALID", 409);
                const [review] = await tx
                    .select()
                    .from(technicalReviews)
                    .where(
                        and(
                            eq(technicalReviews.organizationId, organizationId),
                            eq(technicalReviews.revisionId, predecessor.id),
                        ),
                    );
                const [approval] = await tx
                    .select()
                    .from(technicalApprovals)
                    .where(
                        and(
                            eq(technicalApprovals.organizationId, organizationId),
                            eq(technicalApprovals.revisionId, predecessor.id),
                        ),
                    );
                if (
                    predecessor.status === "submitted" &&
                    (!review || (review.outcome === "accepted" && !approval))
                )
                    throw new ContractException("TECHNICAL_SUCCESSOR_AWAITING_DECISION", 409);
                const [advanced] = await tx
                    .update(technicalExecutions)
                    .set({
                        version: execution.version + 1,
                        nextRevisionNumber: execution.nextRevisionNumber + 1,
                    })
                    .where(
                        and(
                            eq(technicalExecutions.id, execution.id),
                            eq(technicalExecutions.version, execution.version),
                        ),
                    )
                    .returning();
                if (!advanced) throw new ContractException("VERSION_CONFLICT", 409);
                const [revision] = await tx
                    .insert(executionRevisions)
                    .values({
                        organizationId,
                        executionId,
                        revisionNumber: execution.nextRevisionNumber,
                        predecessorRevisionId: predecessor.id,
                        correctionReason: input.reason,
                        performerUserId: predecessor.performerUserId,
                        performerNameSnapshot: predecessor.performerNameSnapshot,
                        methodName: predecessor.methodName,
                        methodIdentifier: predecessor.methodIdentifier,
                        methodVersion: predecessor.methodVersion,
                        performedStartedAt: predecessor.performedStartedAt,
                        performedEndedAt: predecessor.performedEndedAt,
                        performedAtSiteId: predecessor.performedAtSiteId,
                        performedLocationSnapshot: predecessor.performedLocationSnapshot,
                        technicianNotes: predecessor.technicianNotes,
                        createdByUserId: principal.user.id,
                        updatedByUserId: principal.user.id,
                    })
                    .returning();
                if (!revision) throw new Error("Successor insertion did not return its record");
                const conditions = await tx
                    .select()
                    .from(executionConditions)
                    .where(
                        and(
                            eq(executionConditions.organizationId, organizationId),
                            eq(executionConditions.revisionId, predecessor.id),
                        ),
                    );
                if (conditions.length)
                    await tx.insert(executionConditions).values(
                        conditions.map((row) => ({
                            organizationId,
                            executionId,
                            revisionId: revision.id,
                            position: row.position,
                            name: row.name,
                            decimalValue: row.decimalValue,
                            unitCode: row.unitCode,
                            textValue: row.textValue,
                            observedAt: row.observedAt,
                        })),
                    );
                const refs = await tx
                    .select()
                    .from(executionSupportingAssets)
                    .where(
                        and(
                            eq(executionSupportingAssets.organizationId, organizationId),
                            eq(executionSupportingAssets.revisionId, predecessor.id),
                        ),
                    );
                if (refs.length)
                    await tx.insert(executionSupportingAssets).values(
                        refs.map((row) => ({
                            organizationId,
                            executionId,
                            revisionId: revision.id,
                            assetId: row.assetId,
                            position: row.position,
                            use: row.use,
                            assetLabelSnapshot: row.assetLabelSnapshot,
                        })),
                    );
                await this.history(
                    tx,
                    organizationId,
                    executionId,
                    advanced.version,
                    revision.id,
                    "successor_created",
                    {
                        idempotencyKey: input.idempotencyKey,
                        actorUserId: principal.user.id,
                        expectedExecutionVersion: input.expectedExecutionVersion,
                        predecessorRevisionId: predecessor.id,
                        reason: input.reason,
                    },
                    principal.user.id,
                );
                await this.audit(
                    tx,
                    principal,
                    organizationId,
                    revision.id,
                    "technical_revision.successor_created",
                    revision.version,
                );
                return revision;
            },
        );
    }

    discard(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: DiscardExecutionDraft,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) => {
                const execution = await this.lockExecution(tx, organizationId, executionId);
                const revision = await this.lockRevision(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                );
                if (execution.status !== "active" || revision.status !== "draft")
                    throw new ContractException("TECHNICAL_REVISION_NOT_EDITABLE", 409);
                if (revision.version !== input.expectedVersion)
                    throw new ContractException("VERSION_CONFLICT", 409);
                const [discarded] = await tx
                    .update(executionRevisions)
                    .set({
                        status: "discarded",
                        version: revision.version + 1,
                        discardedByUserId: principal.user.id,
                        discardedAt: new Date(),
                        discardReason: input.reason,
                        updatedByUserId: principal.user.id,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(executionRevisions.id, revision.id),
                            eq(executionRevisions.version, revision.version),
                        ),
                    )
                    .returning();
                if (!discarded) throw new ContractException("VERSION_CONFLICT", 409);
                const [advanced] = await tx
                    .update(technicalExecutions)
                    .set({ version: execution.version + 1 })
                    .where(
                        and(
                            eq(technicalExecutions.id, execution.id),
                            eq(technicalExecutions.version, execution.version),
                        ),
                    )
                    .returning();
                if (!advanced) throw new ContractException("VERSION_CONFLICT", 409);
                await this.history(
                    tx,
                    organizationId,
                    executionId,
                    advanced.version,
                    revisionId,
                    "discarded",
                    { reason: input.reason },
                    principal.user.id,
                );
                await this.audit(
                    tx,
                    principal,
                    organizationId,
                    revisionId,
                    "technical_revision.discarded",
                    discarded.version,
                );
                return discarded;
            },
        );
    }

    abandon(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        input: AbandonTechnicalExecution,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) => {
                const execution = await this.lockExecution(tx, organizationId, executionId);
                if (execution.status !== "active")
                    throw new ContractException("TECHNICAL_EXECUTION_INACTIVE", 409);
                if (execution.version !== input.expectedVersion)
                    throw new ContractException("VERSION_CONFLICT", 409);
                const [approval] = await tx
                    .select({ id: technicalApprovals.id })
                    .from(technicalApprovals)
                    .where(
                        and(
                            eq(technicalApprovals.organizationId, organizationId),
                            eq(technicalApprovals.executionId, executionId),
                            eq(technicalApprovals.outcome, "approved"),
                        ),
                    )
                    .limit(1);
                if (approval) throw new ContractException("TECHNICAL_EXECUTION_APPROVED", 409);
                const [draft] = await tx
                    .select()
                    .from(executionRevisions)
                    .where(
                        and(
                            eq(executionRevisions.organizationId, organizationId),
                            eq(executionRevisions.executionId, executionId),
                            eq(executionRevisions.status, "draft"),
                        ),
                    )
                    .for("update");
                if (draft) {
                    await tx
                        .update(executionRevisions)
                        .set({
                            status: "discarded",
                            version: draft.version + 1,
                            discardedByUserId: principal.user.id,
                            discardedAt: new Date(),
                            discardReason: input.reason,
                            updatedByUserId: principal.user.id,
                            updatedAt: new Date(),
                        })
                        .where(eq(executionRevisions.id, draft.id));
                }
                const [abandoned] = await tx
                    .update(technicalExecutions)
                    .set({
                        status: "abandoned",
                        version: execution.version + 1,
                        abandonedByUserId: principal.user.id,
                        abandonedAt: new Date(),
                        abandonmentReason: input.reason,
                    })
                    .where(
                        and(
                            eq(technicalExecutions.id, execution.id),
                            eq(technicalExecutions.version, execution.version),
                        ),
                    )
                    .returning();
                if (!abandoned) throw new ContractException("VERSION_CONFLICT", 409);
                await this.history(
                    tx,
                    organizationId,
                    executionId,
                    abandoned.version,
                    draft?.id ?? null,
                    "abandoned",
                    { reason: input.reason },
                    principal.user.id,
                );
                await this.audit(
                    tx,
                    principal,
                    organizationId,
                    executionId,
                    "technical_execution.abandoned",
                    abandoned.version,
                );
                return abandoned;
            },
        );
    }

    private async history(
        tx: Transaction,
        organizationId: string,
        executionId: string,
        executionVersion: number,
        revisionId: string | null,
        kind: string,
        snapshot: Record<string, unknown>,
        actorId: string,
    ) {
        await tx.insert(executionHistoryEntries).values({
            organizationId,
            executionId,
            executionVersion,
            revisionId,
            kind,
            snapshot,
            recordedByUserId: actorId,
        });
    }

    private async audit(
        tx: Transaction,
        principal: AuthenticatedPrincipal,
        organizationId: string,
        resourceId: string,
        action:
            | "technical_execution.abandoned"
            | "technical_revision.edited"
            | "technical_revision.submitted"
            | "technical_revision.successor_created"
            | "technical_revision.discarded",
        version: number,
    ) {
        await recordAuditEvent(tx, {
            organizationId,
            actorUserId: principal.user.id,
            action,
            resourceType: action.startsWith("technical_execution")
                ? "technical_execution"
                : "technical_revision",
            resourceId,
            metadata: { version },
        });
    }
}
