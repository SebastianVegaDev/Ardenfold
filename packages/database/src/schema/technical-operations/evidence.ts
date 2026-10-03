import { sql } from "drizzle-orm";
import {
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { storedObjects } from "../files/stored-objects";
import { organizationMemberships, users } from "../identity";
import { executionRevisions } from "./executions";
import { technicalApprovals, technicalReviews } from "./reviews";
import { technicalResults } from "./results";

export const technicalEvidenceTarget = pgEnum("technical_evidence_target", [
    "revision",
    "result",
    "review",
    "approval",
]);
export const technicalEvidenceKind = pgEnum("technical_evidence_kind", ["file", "observation"]);

export const technicalEvidence = pgTable(
    "technical_evidence",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        executionId: uuid("execution_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        target: technicalEvidenceTarget("target").notNull(),
        resultId: uuid("result_id"),
        reviewId: uuid("review_id"),
        approvalId: uuid("approval_id"),
        kind: technicalEvidenceKind("kind").notNull(),
        evidenceType: varchar("evidence_type", { length: 80 }).notNull(),
        description: text("description").notNull(),
        storedObjectId: uuid("stored_object_id"),
        observationText: text("observation_text"),
        attributedMembershipId: uuid("attributed_membership_id").notNull(),
        attributedByUserId: uuid("attributed_by_user_id").notNull(),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
        sourceEvidenceId: uuid("source_evidence_id"),
        correctionReason: text("correction_reason"),
        version: integer("version").default(1).notNull(),
        updatedByUserId: uuid("updated_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
        removedByUserId: uuid("removed_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        removedAt: timestamp("removed_at", { withTimezone: true }),
    },
    (table) => [
        unique("technical_evidence_org_execution_id_unique").on(
            table.organizationId,
            table.executionId,
            table.id,
        ),
        unique("technical_evidence_org_revision_id_unique").on(
            table.organizationId,
            table.revisionId,
            table.id,
        ),
        foreignKey({
            name: "technical_evidence_revision_fk",
            columns: [table.organizationId, table.executionId, table.revisionId],
            foreignColumns: [
                executionRevisions.organizationId,
                executionRevisions.executionId,
                executionRevisions.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_evidence_result_fk",
            columns: [table.organizationId, table.executionId, table.revisionId, table.resultId],
            foreignColumns: [
                technicalResults.organizationId,
                technicalResults.executionId,
                technicalResults.revisionId,
                technicalResults.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_evidence_review_fk",
            columns: [table.organizationId, table.executionId, table.revisionId, table.reviewId],
            foreignColumns: [
                technicalReviews.organizationId,
                technicalReviews.executionId,
                technicalReviews.revisionId,
                technicalReviews.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_evidence_approval_fk",
            columns: [table.organizationId, table.executionId, table.revisionId, table.approvalId],
            foreignColumns: [
                technicalApprovals.organizationId,
                technicalApprovals.executionId,
                technicalApprovals.revisionId,
                technicalApprovals.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_evidence_stored_object_fk",
            columns: [table.organizationId, table.storedObjectId],
            foreignColumns: [storedObjects.organizationId, storedObjects.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_evidence_actor_fk",
            columns: [table.organizationId, table.attributedMembershipId, table.attributedByUserId],
            foreignColumns: [
                organizationMemberships.organizationId,
                organizationMemberships.id,
                organizationMemberships.userId,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_evidence_source_fk",
            columns: [table.organizationId, table.executionId, table.sourceEvidenceId],
            foreignColumns: [table.organizationId, table.executionId, table.id],
        }).onDelete("restrict"),
        index("technical_evidence_org_revision_target_idx").on(
            table.organizationId,
            table.revisionId,
            table.target,
            table.recordedAt,
        ),
        check(
            "technical_evidence_target_fields",
            sql`(${table.target} = 'revision' AND ${table.resultId} IS NULL AND ${table.reviewId} IS NULL AND ${table.approvalId} IS NULL) OR (${table.target} = 'result' AND ${table.resultId} IS NOT NULL AND ${table.reviewId} IS NULL AND ${table.approvalId} IS NULL) OR (${table.target} = 'review' AND ${table.resultId} IS NULL AND ${table.reviewId} IS NOT NULL AND ${table.approvalId} IS NULL) OR (${table.target} = 'approval' AND ${table.resultId} IS NULL AND ${table.reviewId} IS NULL AND ${table.approvalId} IS NOT NULL)`,
        ),
        check(
            "technical_evidence_content_kind",
            sql`(${table.kind} = 'file' AND ${table.storedObjectId} IS NOT NULL AND ${table.observationText} IS NULL) OR (${table.kind} = 'observation' AND ${table.storedObjectId} IS NULL AND ${table.observationText} IS NOT NULL AND char_length(btrim(${table.observationText})) BETWEEN 1 AND 4000)`,
        ),
        check(
            "technical_evidence_type_code",
            sql`${table.evidenceType} ~ '^[a-z][a-z0-9_]{0,79}$'`,
        ),
        check(
            "technical_evidence_description_bounded",
            sql`char_length(btrim(${table.description})) BETWEEN 1 AND 2000`,
        ),
        check("technical_evidence_version_positive", sql`${table.version} > 0`),
        check(
            "technical_evidence_correction",
            sql`(${table.sourceEvidenceId} IS NULL AND ${table.correctionReason} IS NULL) OR (${table.sourceEvidenceId} IS NOT NULL AND ${table.sourceEvidenceId} <> ${table.id} AND ${table.correctionReason} IS NOT NULL AND char_length(btrim(${table.correctionReason})) BETWEEN 1 AND 2000)`,
        ),
        check(
            "technical_evidence_removal",
            sql`(${table.removedAt} IS NULL AND ${table.removedByUserId} IS NULL) OR (${table.removedAt} IS NOT NULL AND ${table.removedByUserId} IS NOT NULL)`,
        ),
    ],
);

export const technicalEvidenceHistoryEntries = pgTable(
    "technical_evidence_history_entries",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        evidenceId: uuid("evidence_id").notNull(),
        evidenceVersion: integer("evidence_version").notNull(),
        kind: varchar("kind", { length: 40 }).notNull(),
        snapshot: jsonb("snapshot").notNull(),
        recordedByUserId: uuid("recorded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("technical_evidence_history_version_unique").on(
            table.organizationId,
            table.evidenceId,
            table.evidenceVersion,
        ),
        foreignKey({
            name: "technical_evidence_history_parent_fk",
            columns: [table.organizationId, table.revisionId, table.evidenceId],
            foreignColumns: [
                technicalEvidence.organizationId,
                technicalEvidence.revisionId,
                technicalEvidence.id,
            ],
        }).onDelete("restrict"),
        check("technical_evidence_history_version_positive", sql`${table.evidenceVersion} > 0`),
        check(
            "technical_evidence_history_kind_not_blank",
            sql`char_length(btrim(${table.kind})) > 0`,
        ),
        check(
            "technical_evidence_history_snapshot_object",
            sql`jsonb_typeof(${table.snapshot}) = 'object'`,
        ),
    ],
);
