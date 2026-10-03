import { sql } from "drizzle-orm";
import {
    check,
    foreignKey,
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { organizationMemberships } from "../identity";
import { executionRevisions } from "./executions";

export const technicalReviewOutcome = pgEnum("technical_review_outcome", [
    "accepted",
    "changes_requested",
    "rejected",
]);

export const technicalReviews = pgTable(
    "technical_reviews",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        executionId: uuid("execution_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        outcome: technicalReviewOutcome("outcome").notNull(),
        reviewerMembershipId: uuid("reviewer_membership_id").notNull(),
        reviewerUserId: uuid("reviewer_user_id").notNull(),
        reviewerNameSnapshot: varchar("reviewer_name_snapshot", { length: 240 }).notNull(),
        decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
        reason: text("reason"),
        notes: text("notes"),
        policyVersion: varchar("policy_version", { length: 80 }).notNull(),
        idempotencyKey: uuid("idempotency_key").notNull(),
        payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    },
    (table) => [
        unique("technical_reviews_org_execution_revision_id_unique").on(
            table.organizationId,
            table.executionId,
            table.revisionId,
            table.id,
        ),
        unique("technical_reviews_org_revision_unique").on(table.organizationId, table.revisionId),
        unique("technical_reviews_org_command_unique").on(
            table.organizationId,
            table.idempotencyKey,
        ),
        foreignKey({
            name: "technical_reviews_revision_fk",
            columns: [table.organizationId, table.executionId, table.revisionId],
            foreignColumns: [
                executionRevisions.organizationId,
                executionRevisions.executionId,
                executionRevisions.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_reviews_actor_fk",
            columns: [table.organizationId, table.reviewerMembershipId, table.reviewerUserId],
            foreignColumns: [
                organizationMemberships.organizationId,
                organizationMemberships.id,
                organizationMemberships.userId,
            ],
        }).onDelete("restrict"),
        index("technical_reviews_org_reviewer_decided_idx").on(
            table.organizationId,
            table.reviewerUserId,
            table.decidedAt.desc(),
        ),
        check(
            "technical_reviews_name_not_blank",
            sql`char_length(btrim(${table.reviewerNameSnapshot})) > 0`,
        ),
        check(
            "technical_reviews_policy_not_blank",
            sql`char_length(btrim(${table.policyVersion})) > 0`,
        ),
        check("technical_reviews_payload_hash", sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
        check(
            "technical_reviews_reason",
            sql`(${table.outcome} = 'accepted' AND (${table.reason} IS NULL OR char_length(btrim(${table.reason})) > 0)) OR (${table.outcome} <> 'accepted' AND ${table.reason} IS NOT NULL AND char_length(btrim(${table.reason})) > 0)`,
        ),
        check(
            "technical_reviews_notes_bounded",
            sql`${table.notes} IS NULL OR char_length(${table.notes}) <= 4000`,
        ),
    ],
);

export const technicalApprovalOutcome = pgEnum("technical_approval_outcome", [
    "approved",
    "declined",
]);

export const technicalApprovals = pgTable(
    "technical_approvals",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        executionId: uuid("execution_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        reviewId: uuid("review_id").notNull(),
        outcome: technicalApprovalOutcome("outcome").notNull(),
        approverMembershipId: uuid("approver_membership_id").notNull(),
        approverUserId: uuid("approver_user_id").notNull(),
        approverNameSnapshot: varchar("approver_name_snapshot", { length: 240 }).notNull(),
        decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
        reason: text("reason"),
        notes: text("notes"),
        policyVersion: varchar("policy_version", { length: 80 }).notNull(),
        idempotencyKey: uuid("idempotency_key").notNull(),
        payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    },
    (table) => [
        unique("technical_approvals_org_execution_revision_id_unique").on(
            table.organizationId,
            table.executionId,
            table.revisionId,
            table.id,
        ),
        unique("technical_approvals_org_revision_unique").on(
            table.organizationId,
            table.revisionId,
        ),
        unique("technical_approvals_org_command_unique").on(
            table.organizationId,
            table.idempotencyKey,
        ),
        foreignKey({
            name: "technical_approvals_review_fk",
            columns: [table.organizationId, table.executionId, table.revisionId, table.reviewId],
            foreignColumns: [
                technicalReviews.organizationId,
                technicalReviews.executionId,
                technicalReviews.revisionId,
                technicalReviews.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_approvals_actor_fk",
            columns: [table.organizationId, table.approverMembershipId, table.approverUserId],
            foreignColumns: [
                organizationMemberships.organizationId,
                organizationMemberships.id,
                organizationMemberships.userId,
            ],
        }).onDelete("restrict"),
        index("technical_approvals_org_approver_decided_idx").on(
            table.organizationId,
            table.approverUserId,
            table.decidedAt.desc(),
        ),
        check(
            "technical_approvals_name_not_blank",
            sql`char_length(btrim(${table.approverNameSnapshot})) > 0`,
        ),
        check(
            "technical_approvals_policy_not_blank",
            sql`char_length(btrim(${table.policyVersion})) > 0`,
        ),
        check("technical_approvals_payload_hash", sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
        check(
            "technical_approvals_reason",
            sql`(${table.outcome} = 'approved' AND (${table.reason} IS NULL OR char_length(btrim(${table.reason})) > 0)) OR (${table.outcome} = 'declined' AND ${table.reason} IS NOT NULL AND char_length(btrim(${table.reason})) > 0)`,
        ),
        check(
            "technical_approvals_notes_bounded",
            sql`${table.notes} IS NULL OR char_length(${table.notes}) <= 4000`,
        ),
    ],
);
