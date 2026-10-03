import type {
    CreateTechnicalEvidence,
    RemoveTechnicalEvidence,
    UpdateTechnicalEvidence,
} from "@ardenfold/contracts";
import {
    organizationMemberships,
    storedObjects,
    technicalEvidence,
    technicalResults,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import { recordAuditEvent } from "../../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { PrivateObjectStore } from "../../../files/storage/private-object-store";
import { sha256 } from "../../../files/uploads/file-content";
import { ContractException } from "../../../http/contracts";
import { mutateDraftContent } from "../../results/management/draft-content-transaction";

@Injectable()
export class TechnicalEvidenceService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly storage: PrivateObjectStore,
    ) {}

    create(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        input: CreateTechnicalEvidence,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [
                "technical_executions.write",
                "technical_executions.read",
                "technical_evidence.read",
                ...(input.kind === "file" ? (["files.upload", "files.read"] as const) : []),
            ],
            async (tx) =>
                mutateDraftContent(
                    tx,
                    organizationId,
                    executionId,
                    revisionId,
                    input.expectedRevisionVersion,
                    principal.user.id,
                    "evidence_created",
                    async () => {
                        const [membership] = await tx
                            .select({ id: organizationMemberships.id })
                            .from(organizationMemberships)
                            .where(
                                and(
                                    eq(organizationMemberships.organizationId, organizationId),
                                    eq(organizationMemberships.userId, principal.user.id),
                                    eq(organizationMemberships.status, "active"),
                                ),
                            )
                            .limit(1);
                        if (!membership)
                            throw new ContractException("TECHNICAL_EVIDENCE_ACTOR_INVALID", 403);
                        if (input.resultId) {
                            const [result] = await tx
                                .select({ id: technicalResults.id })
                                .from(technicalResults)
                                .where(
                                    and(
                                        eq(technicalResults.organizationId, organizationId),
                                        eq(technicalResults.revisionId, revisionId),
                                        eq(technicalResults.id, input.resultId),
                                    ),
                                );
                            if (!result)
                                throw new ContractException("TECHNICAL_RESULT_NOT_FOUND", 404);
                        }
                        if (input.kind === "file") {
                            const [object] = await tx
                                .select()
                                .from(storedObjects)
                                .where(
                                    and(
                                        eq(storedObjects.organizationId, organizationId),
                                        eq(storedObjects.id, input.storedObjectId),
                                    ),
                                )
                                .for("update");
                            if (
                                !object ||
                                object.status !== "finalized" ||
                                object.uploadedByUserId !== principal.user.id
                            )
                                throw new ContractException("EVIDENCE_FILE_NOT_FOUND", 404);
                            if (!object.retainedAt)
                                await tx
                                    .update(storedObjects)
                                    .set({ retainedAt: new Date() })
                                    .where(eq(storedObjects.id, object.id));
                        }
                        const [evidence] = await tx
                            .insert(technicalEvidence)
                            .values({
                                organizationId,
                                executionId,
                                revisionId,
                                target: input.target,
                                resultId: input.resultId,
                                kind: input.kind,
                                evidenceType: input.evidenceType,
                                description: input.description,
                                storedObjectId: input.kind === "file" ? input.storedObjectId : null,
                                observationText:
                                    input.kind === "observation" ? input.observationText : null,
                                attributedMembershipId: membership.id,
                                attributedByUserId: principal.user.id,
                                updatedByUserId: principal.user.id,
                            })
                            .returning();
                        if (!evidence)
                            throw new Error("Evidence insertion did not return its record");
                        await recordAuditEvent(tx, {
                            organizationId,
                            actorUserId: principal.user.id,
                            action: "technical_evidence.created",
                            resourceType: "technical_evidence",
                            resourceId: evidence.id,
                            metadata: { revisionId, kind: evidence.kind },
                        });
                        return evidence;
                    },
                ),
        );
    }

    update(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        evidenceId: string,
        input: UpdateTechnicalEvidence,
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
                    "evidence_updated",
                    async () => {
                        const [evidence] = await tx
                            .select()
                            .from(technicalEvidence)
                            .where(
                                and(
                                    eq(technicalEvidence.organizationId, organizationId),
                                    eq(technicalEvidence.revisionId, revisionId),
                                    eq(technicalEvidence.id, evidenceId),
                                ),
                            )
                            .for("update");
                        if (!evidence || evidence.removedAt)
                            throw new ContractException("TECHNICAL_EVIDENCE_NOT_FOUND", 404);
                        if (evidence.version !== input.expectedEvidenceVersion)
                            throw new ContractException("VERSION_CONFLICT", 409);
                        if (evidence.kind === "file" && input.observationText !== undefined)
                            throw new ContractException("TECHNICAL_EVIDENCE_KIND_INVALID", 400);
                        const [updated] = await tx
                            .update(technicalEvidence)
                            .set({
                                evidenceType: input.evidenceType,
                                description: input.description,
                                observationText:
                                    evidence.kind === "observation"
                                        ? (input.observationText ?? evidence.observationText)
                                        : null,
                                version: evidence.version + 1,
                                updatedByUserId: principal.user.id,
                                updatedAt: new Date(),
                            })
                            .where(
                                and(
                                    eq(technicalEvidence.id, evidenceId),
                                    eq(technicalEvidence.version, evidence.version),
                                ),
                            )
                            .returning();
                        if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
                        await recordAuditEvent(tx, {
                            organizationId,
                            actorUserId: principal.user.id,
                            action: "technical_evidence.updated",
                            resourceType: "technical_evidence",
                            resourceId: evidenceId,
                            metadata: { revisionId, version: updated.version },
                        });
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
        evidenceId: string,
        input: RemoveTechnicalEvidence,
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
                    "evidence_removed",
                    async () => {
                        const [evidence] = await tx
                            .select()
                            .from(technicalEvidence)
                            .where(
                                and(
                                    eq(technicalEvidence.organizationId, organizationId),
                                    eq(technicalEvidence.revisionId, revisionId),
                                    eq(technicalEvidence.id, evidenceId),
                                ),
                            )
                            .for("update");
                        if (!evidence || evidence.removedAt)
                            throw new ContractException("TECHNICAL_EVIDENCE_NOT_FOUND", 404);
                        if (evidence.version !== input.expectedEvidenceVersion)
                            throw new ContractException("VERSION_CONFLICT", 409);
                        const [removed] = await tx
                            .update(technicalEvidence)
                            .set({
                                version: evidence.version + 1,
                                removedByUserId: principal.user.id,
                                removedAt: new Date(),
                                updatedByUserId: principal.user.id,
                                updatedAt: new Date(),
                            })
                            .where(
                                and(
                                    eq(technicalEvidence.id, evidenceId),
                                    eq(technicalEvidence.version, evidence.version),
                                ),
                            )
                            .returning();
                        if (!removed) throw new ContractException("VERSION_CONFLICT", 409);
                        await recordAuditEvent(tx, {
                            organizationId,
                            actorUserId: principal.user.id,
                            action: "technical_evidence.removed",
                            resourceType: "technical_evidence",
                            resourceId: evidenceId,
                            metadata: { revisionId, version: removed.version },
                        });
                        return removed;
                    },
                ),
        );
    }

    list(
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
                const rows = await tx
                    .select()
                    .from(technicalEvidence)
                    .where(
                        and(
                            eq(technicalEvidence.organizationId, organizationId),
                            eq(technicalEvidence.executionId, executionId),
                            eq(technicalEvidence.revisionId, revisionId),
                            isNull(technicalEvidence.removedAt),
                        ),
                    )
                    .orderBy(technicalEvidence.recordedAt, technicalEvidence.id);
                return { data: rows };
            },
        );
    }

    async download(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        executionId: string,
        revisionId: string,
        evidenceId: string,
    ) {
        const row = await this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["technical_executions.read", "technical_evidence.read", "files.read"],
            async (tx) => {
                const [joined] = await tx
                    .select({
                        evidenceId: technicalEvidence.id,
                        storedObjectId: storedObjects.id,
                        storageKey: storedObjects.storageKey,
                        filename: storedObjects.originalFilename,
                        byteLength: storedObjects.byteLength,
                        digest: storedObjects.sha256,
                        mediaType: storedObjects.mediaType,
                        status: storedObjects.status,
                    })
                    .from(technicalEvidence)
                    .innerJoin(
                        storedObjects,
                        and(
                            eq(storedObjects.organizationId, technicalEvidence.organizationId),
                            eq(storedObjects.id, technicalEvidence.storedObjectId),
                        ),
                    )
                    .where(
                        and(
                            eq(technicalEvidence.organizationId, organizationId),
                            eq(technicalEvidence.executionId, executionId),
                            eq(technicalEvidence.revisionId, revisionId),
                            eq(technicalEvidence.id, evidenceId),
                            eq(technicalEvidence.kind, "file"),
                            isNull(technicalEvidence.removedAt),
                        ),
                    )
                    .limit(1);
                if (!joined || joined.status !== "finalized")
                    throw new ContractException("TECHNICAL_EVIDENCE_NOT_FOUND", 404);
                return joined;
            },
        );
        const object = await this.storage.get(row.storageKey);
        if (
            !object ||
            object.bytes.length !== row.byteLength ||
            sha256(object.bytes) !== row.digest ||
            object.mediaType !== row.mediaType
        )
            throw new ContractException("STORED_OBJECT_MISMATCH", 409);
        return { bytes: object.bytes, filename: row.filename, mediaType: row.mediaType };
    }
}
