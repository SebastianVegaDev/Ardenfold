import type {
    CreateTechnicalResult,
    CreateTechnicalResultGroup,
    RemoveTechnicalResult,
    RemoveTechnicalResultGroup,
    ReorderTechnicalResultGroups,
    ReorderTechnicalResults,
    TechnicalResultValue,
    UpdateTechnicalResult,
    UpdateTechnicalResultGroup,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    technicalEvidence,
    technicalResultGroups,
    technicalResults,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import Decimal from "decimal.js";
import { and, eq, isNull, ne } from "drizzle-orm";

import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";
import { mutateDraftContent } from "./draft-content-transaction";

type ResultFields = Pick<
    typeof technicalResults.$inferInsert,
    | "groupId"
    | "position"
    | "characteristic"
    | "contextNote"
    | "kind"
    | "decimalValueText"
    | "unitCode"
    | "resolutionText"
    | "significantDigits"
    | "uncertaintyText"
    | "uncertaintyUnitCode"
    | "uncertaintyCoverage"
    | "toleranceLowerText"
    | "toleranceUpperText"
    | "toleranceUnitCode"
    | "toleranceRule"
    | "categoryCode"
    | "categoryLabel"
    | "categoryMeaningSnapshot"
    | "textValue"
    | "textLanguage"
    | "missingReason"
    | "missingExplanation"
    | "conformity"
    | "conformityRule"
>;

function fields(value: TechnicalResultValue): ResultFields {
    if (value.kind === "quantitative") {
        if (value.resolutionText !== null && new Decimal(value.resolutionText).lte(0))
            throw new ContractException("TECHNICAL_RESOLUTION_INVALID", 400);
        if (
            value.toleranceLowerText !== null &&
            value.toleranceUpperText !== null &&
            new Decimal(value.toleranceLowerText).gt(value.toleranceUpperText)
        )
            throw new ContractException("TECHNICAL_TOLERANCE_INVALID", 400);
    }
    if (value.kind !== "missing" && (value.conformity === null) !== (value.conformityRule === null))
        throw new ContractException("TECHNICAL_CONFORMITY_INVALID", 400);
    const row: ResultFields = {
        groupId: value.groupId,
        position: value.position,
        characteristic: value.characteristic,
        contextNote: value.contextNote,
        kind: value.kind,
        decimalValueText: null,
        unitCode: null,
        resolutionText: null,
        significantDigits: null,
        uncertaintyText: null,
        uncertaintyUnitCode: null,
        uncertaintyCoverage: null,
        toleranceLowerText: null,
        toleranceUpperText: null,
        toleranceUnitCode: null,
        toleranceRule: null,
        categoryCode: null,
        categoryLabel: null,
        categoryMeaningSnapshot: null,
        textValue: null,
        textLanguage: null,
        missingReason: null,
        missingExplanation: null,
        conformity: null,
        conformityRule: null,
    };
    switch (value.kind) {
        case "quantitative":
            return {
                ...row,
                decimalValueText: value.decimalValueText,
                unitCode: value.unitCode,
                resolutionText: value.resolutionText,
                significantDigits: value.significantDigits,
                uncertaintyText: value.uncertaintyText,
                uncertaintyUnitCode: value.uncertaintyUnitCode,
                uncertaintyCoverage: value.uncertaintyCoverage,
                toleranceLowerText: value.toleranceLowerText,
                toleranceUpperText: value.toleranceUpperText,
                toleranceUnitCode: value.toleranceUnitCode,
                toleranceRule: value.toleranceRule,
                conformity: value.conformity,
                conformityRule: value.conformityRule,
            };
        case "categorical":
            return {
                ...row,
                categoryCode: value.categoryCode,
                categoryLabel: value.categoryLabel,
                categoryMeaningSnapshot: value.categoryMeaningSnapshot,
                conformity: value.conformity,
                conformityRule: value.conformityRule,
            };
        case "textual":
            return {
                ...row,
                textValue: value.textValue,
                textLanguage: value.textLanguage,
                conformity: value.conformity,
                conformityRule: value.conformityRule,
            };
        case "missing":
            return {
                ...row,
                missingReason: value.missingReason,
                missingExplanation: value.missingExplanation,
            };
    }
}

@Injectable()
export class TechnicalResultsService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.read"],
            async (tx) => {
                const groups = await tx
                    .select()
                    .from(technicalResultGroups)
                    .where(
                        and(
                            eq(technicalResultGroups.organizationId, organizationId),
                            eq(technicalResultGroups.executionId, executionId),
                            eq(technicalResultGroups.revisionId, revisionId),
                        ),
                    )
                    .orderBy(technicalResultGroups.position, technicalResultGroups.id);
                const results = await tx
                    .select()
                    .from(technicalResults)
                    .where(
                        and(
                            eq(technicalResults.organizationId, organizationId),
                            eq(technicalResults.executionId, executionId),
                            eq(technicalResults.revisionId, revisionId),
                        ),
                    )
                    .orderBy(
                        technicalResults.groupId,
                        technicalResults.position,
                        technicalResults.id,
                    );
                return { groups, results };
            },
        );
    }

    private async requireGroup(
        tx: ArdenfoldTransaction,
        organizationId: string,
        revisionId: string,
        groupId: string | null,
    ) {
        if (!groupId) return;
        const [group] = await tx
            .select({ id: technicalResultGroups.id })
            .from(technicalResultGroups)
            .where(
                and(
                    eq(technicalResultGroups.organizationId, organizationId),
                    eq(technicalResultGroups.revisionId, revisionId),
                    eq(technicalResultGroups.id, groupId),
                ),
            );
        if (!group) throw new ContractException("TECHNICAL_RESULT_GROUP_NOT_FOUND", 404);
    }

    create(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: CreateTechnicalResult,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) =>
                mutateDraftContent(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                    input.expectedRevisionVersion,
                    principal.user.id,
                    "result_created",
                    async () => {
                        await this.requireGroup(
                            tx,
                            organizationId,
                            revisionId,
                            input.value.groupId,
                        );
                        await this.requirePosition(
                            tx,
                            organizationId,
                            revisionId,
                            input.value.groupId,
                            input.value.position,
                        );
                        const [result] = await tx
                            .insert(technicalResults)
                            .values({
                                organizationId,
                                executionId,
                                revisionId,
                                ...fields(input.value),
                                createdByUserId: principal.user.id,
                                updatedByUserId: principal.user.id,
                            })
                            .returning();
                        return result!;
                    },
                ),
        );
    }

    update(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        resultId: string,
        input: UpdateTechnicalResult,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) =>
                mutateDraftContent(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                    input.expectedRevisionVersion,
                    principal.user.id,
                    "result_updated",
                    async () => {
                        const [result] = await tx
                            .select()
                            .from(technicalResults)
                            .where(
                                and(
                                    eq(technicalResults.organizationId, organizationId),
                                    eq(technicalResults.revisionId, revisionId),
                                    eq(technicalResults.id, resultId),
                                ),
                            )
                            .for("update");
                        if (!result) throw new ContractException("TECHNICAL_RESULT_NOT_FOUND", 404);
                        if (result.version !== input.expectedResultVersion)
                            throw new ContractException("VERSION_CONFLICT", 409);
                        await this.requireGroup(
                            tx,
                            organizationId,
                            revisionId,
                            input.value.groupId,
                        );
                        await this.requirePosition(
                            tx,
                            organizationId,
                            revisionId,
                            input.value.groupId,
                            input.value.position,
                            resultId,
                        );
                        const [updated] = await tx
                            .update(technicalResults)
                            .set({
                                ...fields(input.value),
                                version: result.version + 1,
                                updatedByUserId: principal.user.id,
                                updatedAt: new Date(),
                            })
                            .where(
                                and(
                                    eq(technicalResults.id, resultId),
                                    eq(technicalResults.version, result.version),
                                ),
                            )
                            .returning();
                        if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
                        return updated;
                    },
                ),
        );
    }

    remove(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        resultId: string,
        input: RemoveTechnicalResult,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read", "technical_evidence.read"],
            async (tx) =>
                mutateDraftContent(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                    input.expectedRevisionVersion,
                    principal.user.id,
                    "result_removed",
                    async () => {
                        const [result] = await tx
                            .select()
                            .from(technicalResults)
                            .where(
                                and(
                                    eq(technicalResults.organizationId, organizationId),
                                    eq(technicalResults.revisionId, revisionId),
                                    eq(technicalResults.id, resultId),
                                ),
                            )
                            .for("update");
                        if (!result) throw new ContractException("TECHNICAL_RESULT_NOT_FOUND", 404);
                        if (result.version !== input.expectedResultVersion)
                            throw new ContractException("VERSION_CONFLICT", 409);
                        const [evidence] = await tx
                            .select({ id: technicalEvidence.id })
                            .from(technicalEvidence)
                            .where(
                                and(
                                    eq(technicalEvidence.organizationId, organizationId),
                                    eq(technicalEvidence.resultId, resultId),
                                ),
                            )
                            .limit(1);
                        if (evidence)
                            throw new ContractException("TECHNICAL_RESULT_HAS_EVIDENCE", 409);
                        await tx.delete(technicalResults).where(eq(technicalResults.id, resultId));
                        return { id: resultId };
                    },
                ),
        );
    }

    createGroup(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: CreateTechnicalResultGroup,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) =>
                mutateDraftContent(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                    input.expectedRevisionVersion,
                    principal.user.id,
                    "result_group_created",
                    async () => {
                        const [existing] = await tx
                            .select({ id: technicalResultGroups.id })
                            .from(technicalResultGroups)
                            .where(
                                and(
                                    eq(technicalResultGroups.organizationId, organizationId),
                                    eq(technicalResultGroups.revisionId, revisionId),
                                    eq(technicalResultGroups.position, input.position),
                                ),
                            )
                            .limit(1);
                        if (existing)
                            throw new ContractException("TECHNICAL_RESULT_POSITION_CONFLICT", 409);
                        const [group] = await tx
                            .insert(technicalResultGroups)
                            .values({
                                organizationId,
                                executionId,
                                revisionId,
                                position: input.position,
                                label: input.label,
                                createdByUserId: principal.user.id,
                                updatedByUserId: principal.user.id,
                            })
                            .returning();
                        return group!;
                    },
                ),
        );
    }

    updateGroup(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        groupId: string,
        input: UpdateTechnicalResultGroup,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) =>
                mutateDraftContent(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                    input.expectedRevisionVersion,
                    principal.user.id,
                    "result_group_updated",
                    async () => {
                        const [group] = await tx
                            .select()
                            .from(technicalResultGroups)
                            .where(
                                and(
                                    eq(technicalResultGroups.organizationId, organizationId),
                                    eq(technicalResultGroups.revisionId, revisionId),
                                    eq(technicalResultGroups.id, groupId),
                                ),
                            )
                            .for("update");
                        if (!group)
                            throw new ContractException("TECHNICAL_RESULT_GROUP_NOT_FOUND", 404);
                        if (group.version !== input.expectedGroupVersion)
                            throw new ContractException("VERSION_CONFLICT", 409);
                        const [occupied] = await tx
                            .select({ id: technicalResultGroups.id })
                            .from(technicalResultGroups)
                            .where(
                                and(
                                    eq(technicalResultGroups.organizationId, organizationId),
                                    eq(technicalResultGroups.revisionId, revisionId),
                                    eq(technicalResultGroups.position, input.position),
                                    ne(technicalResultGroups.id, groupId),
                                ),
                            )
                            .limit(1);
                        if (occupied)
                            throw new ContractException("TECHNICAL_RESULT_POSITION_CONFLICT", 409);
                        const [updated] = await tx
                            .update(technicalResultGroups)
                            .set({
                                position: input.position,
                                label: input.label,
                                version: group.version + 1,
                                updatedByUserId: principal.user.id,
                                updatedAt: new Date(),
                            })
                            .where(
                                and(
                                    eq(technicalResultGroups.id, groupId),
                                    eq(technicalResultGroups.version, group.version),
                                ),
                            )
                            .returning();
                        return updated!;
                    },
                ),
        );
    }

    removeGroup(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        groupId: string,
        input: RemoveTechnicalResultGroup,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) =>
                mutateDraftContent(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                    input.expectedRevisionVersion,
                    principal.user.id,
                    "result_group_removed",
                    async () => {
                        const [group] = await tx
                            .select()
                            .from(technicalResultGroups)
                            .where(
                                and(
                                    eq(technicalResultGroups.organizationId, organizationId),
                                    eq(technicalResultGroups.revisionId, revisionId),
                                    eq(technicalResultGroups.id, groupId),
                                ),
                            )
                            .for("update");
                        if (!group)
                            throw new ContractException("TECHNICAL_RESULT_GROUP_NOT_FOUND", 404);
                        if (group.version !== input.expectedGroupVersion)
                            throw new ContractException("VERSION_CONFLICT", 409);
                        const [member] = await tx
                            .select({ id: technicalResults.id })
                            .from(technicalResults)
                            .where(
                                and(
                                    eq(technicalResults.organizationId, organizationId),
                                    eq(technicalResults.groupId, groupId),
                                ),
                            )
                            .limit(1);
                        if (member)
                            throw new ContractException("TECHNICAL_RESULT_GROUP_NOT_EMPTY", 409);
                        await tx
                            .delete(technicalResultGroups)
                            .where(eq(technicalResultGroups.id, groupId));
                        return { id: groupId };
                    },
                ),
        );
    }

    reorder(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: ReorderTechnicalResults,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) =>
                mutateDraftContent(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                    input.expectedRevisionVersion,
                    principal.user.id,
                    "results_reordered",
                    async () => {
                        const rows = await tx
                            .select()
                            .from(technicalResults)
                            .where(
                                and(
                                    eq(technicalResults.organizationId, organizationId),
                                    eq(technicalResults.executionId, executionId),
                                    eq(technicalResults.revisionId, revisionId),
                                    input.groupId
                                        ? eq(technicalResults.groupId, input.groupId)
                                        : isNull(technicalResults.groupId),
                                ),
                            )
                            .for("update");
                        if (
                            rows.length !== input.orderedIds.length ||
                            new Set(input.orderedIds).size !== rows.length ||
                            input.orderedIds.some((id) => !rows.some((row) => row.id === id))
                        )
                            throw new ContractException("TECHNICAL_RESULT_ORDER_INVALID", 400);
                        const max = Math.max(...rows.map((row) => row.position));
                        if (max + rows.length >= 2_147_483_647)
                            throw new ContractException("TECHNICAL_RESULT_ORDER_INVALID", 400);
                        const byId = new Map(rows.map((row) => [row.id, row]));
                        for (const [index, id] of input.orderedIds.entries()) {
                            const row = byId.get(id)!;
                            await tx
                                .update(technicalResults)
                                .set({
                                    position: max + index + 1,
                                    version: row.version + 1,
                                    updatedByUserId: principal.user.id,
                                    updatedAt: new Date(),
                                })
                                .where(eq(technicalResults.id, id));
                        }
                        for (const [index, id] of input.orderedIds.entries()) {
                            const row = byId.get(id)!;
                            await tx
                                .update(technicalResults)
                                .set({
                                    position: index + 1,
                                    version: row.version + 2,
                                    updatedByUserId: principal.user.id,
                                    updatedAt: new Date(),
                                })
                                .where(eq(technicalResults.id, id));
                        }
                        return { orderedIds: input.orderedIds };
                    },
                ),
        );
    }

    reorderGroups(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: ReorderTechnicalResultGroups,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.write", "technical_executions.read"],
            async (tx) =>
                mutateDraftContent(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                    input.expectedRevisionVersion,
                    principal.user.id,
                    "result_groups_reordered",
                    async () => {
                        const rows = await tx
                            .select()
                            .from(technicalResultGroups)
                            .where(
                                and(
                                    eq(technicalResultGroups.organizationId, organizationId),
                                    eq(technicalResultGroups.executionId, executionId),
                                    eq(technicalResultGroups.revisionId, revisionId),
                                ),
                            )
                            .for("update");
                        if (
                            rows.length !== input.orderedIds.length ||
                            new Set(input.orderedIds).size !== rows.length ||
                            input.orderedIds.some((id) => !rows.some((row) => row.id === id))
                        )
                            throw new ContractException("TECHNICAL_RESULT_ORDER_INVALID", 400);
                        const max = Math.max(...rows.map((row) => row.position));
                        if (max + rows.length >= 2_147_483_647)
                            throw new ContractException("TECHNICAL_RESULT_ORDER_INVALID", 400);
                        const byId = new Map(rows.map((row) => [row.id, row]));
                        for (const [index, id] of input.orderedIds.entries()) {
                            const row = byId.get(id)!;
                            await tx
                                .update(technicalResultGroups)
                                .set({
                                    position: max + index + 1,
                                    version: row.version + 1,
                                    updatedByUserId: principal.user.id,
                                    updatedAt: new Date(),
                                })
                                .where(eq(technicalResultGroups.id, id));
                        }
                        for (const [index, id] of input.orderedIds.entries()) {
                            const row = byId.get(id)!;
                            await tx
                                .update(technicalResultGroups)
                                .set({
                                    position: index + 1,
                                    version: row.version + 2,
                                    updatedByUserId: principal.user.id,
                                    updatedAt: new Date(),
                                })
                                .where(eq(technicalResultGroups.id, id));
                        }
                        return { orderedIds: input.orderedIds };
                    },
                ),
        );
    }

    private async requirePosition(
        tx: ArdenfoldTransaction,
        organizationId: string,
        revisionId: string,
        groupId: string | null,
        position: number,
        exceptId?: string,
    ) {
        const [occupied] = await tx
            .select({ id: technicalResults.id })
            .from(technicalResults)
            .where(
                and(
                    eq(technicalResults.organizationId, organizationId),
                    eq(technicalResults.revisionId, revisionId),
                    groupId
                        ? eq(technicalResults.groupId, groupId)
                        : isNull(technicalResults.groupId),
                    eq(technicalResults.position, position),
                    exceptId ? ne(technicalResults.id, exceptId) : undefined,
                ),
            )
            .limit(1);
        if (occupied) throw new ContractException("TECHNICAL_RESULT_POSITION_CONFLICT", 409);
    }
}
