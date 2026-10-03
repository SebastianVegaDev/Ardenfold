import { sql } from "drizzle-orm";
import {
    boolean,
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { assets } from "../assets";
import { organizationSites, organizations, users } from "../identity";
import { workItems } from "../service-management/work-orders";

export const technicalExecutionStatusValues = ["active", "abandoned"] as const;
export const executionRevisionStatusValues = ["draft", "submitted", "discarded"] as const;

export const technicalExecutionStatus = pgEnum(
    "technical_execution_status",
    technicalExecutionStatusValues,
);
export const executionRevisionStatus = pgEnum(
    "execution_revision_status",
    executionRevisionStatusValues,
);

export const technicalExecutions = pgTable(
    "technical_executions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        workOrderId: uuid("work_order_id").notNull(),
        workItemId: uuid("work_item_id").notNull(),
        attemptNumber: integer("attempt_number").notNull(),
        status: technicalExecutionStatus("status").default("active").notNull(),
        version: integer("version").default(1).notNull(),
        nextRevisionNumber: integer("next_revision_number").default(1).notNull(),
        workItemVersionAtStart: integer("work_item_version_at_start").notNull(),
        acceptedRevisionIdAtStart: uuid("accepted_revision_id_at_start").notNull(),
        sourceRevisionLineIdAtStart: uuid("source_revision_line_id_at_start").notNull(),
        itemNumberAtStart: integer("item_number_at_start").notNull(),
        scopeDescriptionAtStart: text("scope_description_at_start").notNull(),
        allocatedQuantityAtStart: numeric("allocated_quantity_at_start").notNull(),
        allocatedUnitAtStart: varchar("allocated_unit_at_start", { length: 40 }).notNull(),
        siteIdAtStart: uuid("site_id_at_start").notNull(),
        siteNameAtStart: varchar("site_name_at_start", { length: 200 }).notNull(),
        targetAssetIdAtStart: uuid("target_asset_id_at_start"),
        targetAssetLabelAtStart: varchar("target_asset_label_at_start", { length: 240 }),
        idempotencyKey: uuid("idempotency_key").notNull(),
        payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
        startedByUserId: uuid("started_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
        abandonedByUserId: uuid("abandoned_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
        abandonmentReason: text("abandonment_reason"),
    },
    (table) => [
        unique("technical_executions_org_id_unique").on(table.organizationId, table.id),
        unique("technical_executions_org_item_attempt_unique").on(
            table.organizationId,
            table.workItemId,
            table.attemptNumber,
        ),
        unique("technical_executions_org_command_unique").on(
            table.organizationId,
            table.idempotencyKey,
        ),
        uniqueIndex("technical_executions_one_active_item_idx")
            .on(table.organizationId, table.workItemId)
            .where(sql`${table.status} = 'active'`),
        foreignKey({
            name: "technical_executions_work_item_fk",
            columns: [table.organizationId, table.workOrderId, table.workItemId],
            foreignColumns: [workItems.organizationId, workItems.workOrderId, workItems.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_executions_site_fk",
            columns: [table.organizationId, table.siteIdAtStart],
            foreignColumns: [organizationSites.organizationId, organizationSites.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_executions_target_asset_fk",
            columns: [table.organizationId, table.targetAssetIdAtStart],
            foreignColumns: [assets.organizationId, assets.id],
        }).onDelete("restrict"),
        index("technical_executions_org_item_idx").on(
            table.organizationId,
            table.workItemId,
            table.attemptNumber.desc(),
        ),
        index("technical_executions_org_asset_started_idx").on(
            table.organizationId,
            table.targetAssetIdAtStart,
            table.startedAt.desc(),
        ),
        index("technical_executions_org_site_status_idx").on(
            table.organizationId,
            table.siteIdAtStart,
            table.status,
        ),
        check("technical_executions_attempt_positive", sql`${table.attemptNumber} > 0`),
        check("technical_executions_version_positive", sql`${table.version} > 0`),
        check("technical_executions_next_revision", sql`${table.nextRevisionNumber} > 0`),
        check("technical_executions_source_version", sql`${table.workItemVersionAtStart} > 0`),
        check("technical_executions_item_number", sql`${table.itemNumberAtStart} > 0`),
        check(
            "technical_executions_scope_not_blank",
            sql`char_length(btrim(${table.scopeDescriptionAtStart})) > 0`,
        ),
        check(
            "technical_executions_unit_not_blank",
            sql`char_length(btrim(${table.allocatedUnitAtStart})) > 0`,
        ),
        check(
            "technical_executions_site_name_not_blank",
            sql`char_length(btrim(${table.siteNameAtStart})) > 0`,
        ),
        check(
            "technical_executions_target_asset_snapshot",
            sql`(${table.targetAssetIdAtStart} IS NULL AND ${table.targetAssetLabelAtStart} IS NULL) OR (${table.targetAssetIdAtStart} IS NOT NULL AND ${table.targetAssetLabelAtStart} IS NOT NULL AND char_length(btrim(${table.targetAssetLabelAtStart})) > 0)`,
        ),
        check("technical_executions_payload_hash", sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
        check(
            "technical_executions_abandonment_state",
            sql`(${table.status} = 'abandoned' AND ${table.abandonedByUserId} IS NOT NULL AND ${table.abandonedAt} IS NOT NULL AND ${table.abandonmentReason} IS NOT NULL AND char_length(btrim(${table.abandonmentReason})) > 0) OR (${table.status} = 'active' AND ${table.abandonedByUserId} IS NULL AND ${table.abandonedAt} IS NULL AND ${table.abandonmentReason} IS NULL)`,
        ),
    ],
);

export const executionRevisions = pgTable(
    "execution_revisions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        executionId: uuid("execution_id").notNull(),
        revisionNumber: integer("revision_number").notNull(),
        predecessorRevisionId: uuid("predecessor_revision_id"),
        status: executionRevisionStatus("status").default("draft").notNull(),
        version: integer("version").default(1).notNull(),
        performerUserId: uuid("performer_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        performerNameSnapshot: varchar("performer_name_snapshot", { length: 240 }),
        methodName: varchar("method_name", { length: 240 }),
        methodIdentifier: varchar("method_identifier", { length: 120 }),
        methodVersion: varchar("method_version", { length: 120 }),
        performedStartedAt: timestamp("performed_started_at", { withTimezone: true }),
        performedEndedAt: timestamp("performed_ended_at", { withTimezone: true }),
        performedAtSiteId: uuid("performed_at_site_id"),
        performedLocationSnapshot: varchar("performed_location_snapshot", { length: 240 }),
        technicianNotes: text("technician_notes"),
        correctionReason: text("correction_reason"),
        requirePerformerReviewerSeparation: boolean("require_performer_reviewer_separation"),
        requireReviewerApproverSeparation: boolean("require_reviewer_approver_separation"),
        createdByUserId: uuid("created_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedByUserId: uuid("updated_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
        submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        submittedAt: timestamp("submitted_at", { withTimezone: true }),
        discardedByUserId: uuid("discarded_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        discardedAt: timestamp("discarded_at", { withTimezone: true }),
        discardReason: text("discard_reason"),
    },
    (table) => [
        unique("execution_revisions_org_id_unique").on(table.organizationId, table.id),
        unique("execution_revisions_org_execution_id_unique").on(
            table.organizationId,
            table.executionId,
            table.id,
        ),
        unique("execution_revisions_org_execution_number_unique").on(
            table.organizationId,
            table.executionId,
            table.revisionNumber,
        ),
        uniqueIndex("execution_revisions_one_draft_idx")
            .on(table.organizationId, table.executionId)
            .where(sql`${table.status} = 'draft'`),
        foreignKey({
            name: "execution_revisions_execution_fk",
            columns: [table.organizationId, table.executionId],
            foreignColumns: [technicalExecutions.organizationId, technicalExecutions.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "execution_revisions_predecessor_fk",
            columns: [table.organizationId, table.executionId, table.predecessorRevisionId],
            foreignColumns: [table.organizationId, table.executionId, table.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "execution_revisions_performed_site_fk",
            columns: [table.organizationId, table.performedAtSiteId],
            foreignColumns: [organizationSites.organizationId, organizationSites.id],
        }).onDelete("restrict"),
        index("execution_revisions_org_performer_created_idx").on(
            table.organizationId,
            table.performerUserId,
            table.createdAt.desc(),
        ),
        index("execution_revisions_org_status_created_idx").on(
            table.organizationId,
            table.status,
            table.createdAt.desc(),
        ),
        check("execution_revisions_number_positive", sql`${table.revisionNumber} > 0`),
        check("execution_revisions_version_positive", sql`${table.version} > 0`),
        check(
            "execution_revisions_predecessor_number",
            sql`(${table.revisionNumber} = 1 AND ${table.predecessorRevisionId} IS NULL) OR (${table.revisionNumber} > 1 AND ${table.predecessorRevisionId} IS NOT NULL AND ${table.predecessorRevisionId} <> ${table.id})`,
        ),
        check(
            "execution_revisions_performed_interval",
            sql`${table.performedEndedAt} IS NULL OR (${table.performedStartedAt} IS NOT NULL AND ${table.performedEndedAt} >= ${table.performedStartedAt})`,
        ),
        check(
            "execution_revisions_performer_snapshot",
            sql`(${table.performerUserId} IS NULL AND ${table.performerNameSnapshot} IS NULL) OR (${table.performerUserId} IS NOT NULL AND ${table.performerNameSnapshot} IS NOT NULL AND char_length(btrim(${table.performerNameSnapshot})) > 0)`,
        ),
        check(
            "execution_revisions_method_not_blank",
            sql`${table.methodName} IS NULL OR char_length(btrim(${table.methodName})) > 0`,
        ),
        check(
            "execution_revisions_correction_reason",
            sql`(${table.predecessorRevisionId} IS NULL AND ${table.correctionReason} IS NULL) OR (${table.predecessorRevisionId} IS NOT NULL AND ${table.correctionReason} IS NOT NULL AND char_length(btrim(${table.correctionReason})) > 0)`,
        ),
        check(
            "execution_revisions_status_fields",
            sql`(${table.status} = 'draft' AND ${table.submittedAt} IS NULL AND ${table.submittedByUserId} IS NULL AND ${table.discardedAt} IS NULL AND ${table.discardedByUserId} IS NULL AND ${table.discardReason} IS NULL) OR (${table.status} = 'submitted' AND ${table.submittedAt} IS NOT NULL AND ${table.submittedByUserId} IS NOT NULL AND ${table.discardedAt} IS NULL AND ${table.discardedByUserId} IS NULL AND ${table.discardReason} IS NULL AND ${table.performerUserId} IS NOT NULL AND ${table.methodName} IS NOT NULL AND ${table.requirePerformerReviewerSeparation} IS NOT NULL AND ${table.requireReviewerApproverSeparation} IS NOT NULL) OR (${table.status} = 'discarded' AND ${table.submittedAt} IS NULL AND ${table.submittedByUserId} IS NULL AND ${table.discardedAt} IS NOT NULL AND ${table.discardedByUserId} IS NOT NULL AND ${table.discardReason} IS NOT NULL AND char_length(btrim(${table.discardReason})) > 0)`,
        ),
    ],
);

export const executionConditions = pgTable(
    "execution_conditions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        executionId: uuid("execution_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        position: integer("position").notNull(),
        name: varchar("name", { length: 160 }).notNull(),
        decimalValue: numeric("decimal_value"),
        unitCode: varchar("unit_code", { length: 40 }),
        textValue: text("text_value"),
        observedAt: timestamp("observed_at", { withTimezone: true }),
    },
    (table) => [
        unique("execution_conditions_org_revision_position_unique").on(
            table.organizationId,
            table.revisionId,
            table.position,
        ),
        foreignKey({
            name: "execution_conditions_revision_fk",
            columns: [table.organizationId, table.executionId, table.revisionId],
            foreignColumns: [
                executionRevisions.organizationId,
                executionRevisions.executionId,
                executionRevisions.id,
            ],
        }).onDelete("restrict"),
        check("execution_conditions_position_positive", sql`${table.position} > 0`),
        check("execution_conditions_name_not_blank", sql`char_length(btrim(${table.name})) > 0`),
        check(
            "execution_conditions_value_kind",
            sql`(${table.decimalValue} IS NOT NULL AND ${table.unitCode} IS NOT NULL AND char_length(btrim(${table.unitCode})) > 0 AND ${table.textValue} IS NULL) OR (${table.decimalValue} IS NULL AND ${table.unitCode} IS NULL AND ${table.textValue} IS NOT NULL AND char_length(btrim(${table.textValue})) > 0)`,
        ),
    ],
);

export const executionSupportingAssets = pgTable(
    "execution_supporting_assets",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        executionId: uuid("execution_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        assetId: uuid("asset_id").notNull(),
        position: integer("position").notNull(),
        use: varchar("use", { length: 160 }).notNull(),
        assetLabelSnapshot: varchar("asset_label_snapshot", { length: 240 }).notNull(),
    },
    (table) => [
        unique("execution_supporting_assets_org_revision_asset_unique").on(
            table.organizationId,
            table.revisionId,
            table.assetId,
        ),
        unique("execution_supporting_assets_org_revision_position_unique").on(
            table.organizationId,
            table.revisionId,
            table.position,
        ),
        foreignKey({
            name: "execution_supporting_assets_revision_fk",
            columns: [table.organizationId, table.executionId, table.revisionId],
            foreignColumns: [
                executionRevisions.organizationId,
                executionRevisions.executionId,
                executionRevisions.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "execution_supporting_assets_asset_fk",
            columns: [table.organizationId, table.assetId],
            foreignColumns: [assets.organizationId, assets.id],
        }).onDelete("restrict"),
        check("execution_supporting_assets_position_positive", sql`${table.position} > 0`),
        check(
            "execution_supporting_assets_use_not_blank",
            sql`char_length(btrim(${table.use})) > 0`,
        ),
        check(
            "execution_supporting_assets_label_not_blank",
            sql`char_length(btrim(${table.assetLabelSnapshot})) > 0`,
        ),
    ],
);

export const executionHistoryEntries = pgTable(
    "execution_history_entries",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        executionId: uuid("execution_id").notNull(),
        executionVersion: integer("execution_version").notNull(),
        revisionId: uuid("revision_id"),
        kind: varchar("kind", { length: 80 }).notNull(),
        snapshot: jsonb("snapshot").notNull(),
        reason: text("reason"),
        recordedByUserId: uuid("recorded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("execution_history_org_execution_version_unique").on(
            table.organizationId,
            table.executionId,
            table.executionVersion,
        ),
        foreignKey({
            name: "execution_history_execution_fk",
            columns: [table.organizationId, table.executionId],
            foreignColumns: [technicalExecutions.organizationId, technicalExecutions.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "execution_history_revision_fk",
            columns: [table.organizationId, table.executionId, table.revisionId],
            foreignColumns: [
                executionRevisions.organizationId,
                executionRevisions.executionId,
                executionRevisions.id,
            ],
        }).onDelete("restrict"),
        check("execution_history_version_positive", sql`${table.executionVersion} > 0`),
        check("execution_history_kind_not_blank", sql`char_length(btrim(${table.kind})) > 0`),
        check("execution_history_snapshot_object", sql`jsonb_typeof(${table.snapshot}) = 'object'`),
    ],
);
