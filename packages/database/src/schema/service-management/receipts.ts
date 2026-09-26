import { sql } from "drizzle-orm";
import {
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { assets } from "../assets";
import { users } from "../identity";
import { parties } from "../parties";
import { workItems, workOrders } from "./work-orders";

export const receiptCustodyStatusValues = ["not_required", "pending", "applied"] as const;
export const receiptCorrectionKindValues = ["corrected", "reconciled", "voided"] as const;

export const receiptCustodyStatus = pgEnum("receipt_custody_status", receiptCustodyStatusValues);
export const receiptCorrectionKind = pgEnum("receipt_correction_kind", receiptCorrectionKindValues);

export const receipts = pgTable(
    "receipts",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        workOrderId: uuid("work_order_id").notNull(),
        assetId: uuid("asset_id"),
        intakeDescription: text("intake_description").notNull(),
        observedCondition: text("observed_condition").notNull(),
        accessories: jsonb("accessories").default([]).notNull(),
        receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
        responsibleActorName: varchar("responsible_actor_name", { length: 200 }).notNull(),
        responsiblePartyId: uuid("responsible_party_id"),
        custodyStatus: receiptCustodyStatus("custody_status").default("not_required").notNull(),
        version: integer("version").default(1).notNull(),
        idempotencyKey: uuid("idempotency_key").notNull(),
        payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
        recordedByUserId: uuid("recorded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        updatedByUserId: uuid("updated_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
        voidedAt: timestamp("voided_at", { withTimezone: true }),
        voidedByUserId: uuid("voided_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        voidReason: text("void_reason"),
    },
    (table) => [
        unique("receipts_org_id_unique").on(table.organizationId, table.id),
        unique("receipts_org_order_id_unique").on(
            table.organizationId,
            table.workOrderId,
            table.id,
        ),
        unique("receipts_org_idempotency_unique").on(table.organizationId, table.idempotencyKey),
        foreignKey({
            name: "receipts_order_fk",
            columns: [table.organizationId, table.workOrderId],
            foreignColumns: [workOrders.organizationId, workOrders.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "receipts_asset_fk",
            columns: [table.organizationId, table.assetId],
            foreignColumns: [assets.organizationId, assets.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "receipts_responsible_party_fk",
            columns: [table.organizationId, table.responsiblePartyId],
            foreignColumns: [parties.organizationId, parties.id],
        }).onDelete("restrict"),
        index("receipts_org_order_received_idx").on(
            table.organizationId,
            table.workOrderId,
            table.receivedAt.desc(),
            table.id.desc(),
        ),
        index("receipts_org_asset_received_idx").on(
            table.organizationId,
            table.assetId,
            table.receivedAt.desc(),
        ),
        check("receipts_version_positive", sql`${table.version} > 0`),
        check("receipts_payload_hash", sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
        check(
            "receipts_description_not_blank",
            sql`char_length(btrim(${table.intakeDescription})) > 0`,
        ),
        check(
            "receipts_condition_not_blank",
            sql`char_length(btrim(${table.observedCondition})) > 0`,
        ),
        check(
            "receipts_actor_not_blank",
            sql`char_length(btrim(${table.responsibleActorName})) > 0`,
        ),
        check("receipts_accessories_array", sql`jsonb_typeof(${table.accessories}) = 'array'`),
        check(
            "receipts_custody_resolution",
            sql`${table.custodyStatus} <> 'applied' OR ${table.assetId} IS NOT NULL`,
        ),
        check(
            "receipts_void_state",
            sql`(${table.voidedAt} IS NULL AND ${table.voidedByUserId} IS NULL AND ${table.voidReason} IS NULL) OR (${table.voidedAt} IS NOT NULL AND ${table.voidedByUserId} IS NOT NULL AND ${table.voidReason} IS NOT NULL AND char_length(btrim(${table.voidReason})) > 0)`,
        ),
    ],
);

// A physical intake can cover several operational items for the same unit.
export const receiptItems = pgTable(
    "receipt_items",
    {
        organizationId: uuid("organization_id").notNull(),
        workOrderId: uuid("work_order_id").notNull(),
        receiptId: uuid("receipt_id").notNull(),
        workItemId: uuid("work_item_id").notNull(),
    },
    (table) => [
        primaryKey({
            name: "receipt_items_pk",
            columns: [table.organizationId, table.receiptId, table.workItemId],
        }),
        foreignKey({
            name: "receipt_items_receipt_fk",
            columns: [table.organizationId, table.workOrderId, table.receiptId],
            foreignColumns: [receipts.organizationId, receipts.workOrderId, receipts.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "receipt_items_work_item_fk",
            columns: [table.organizationId, table.workOrderId, table.workItemId],
            foreignColumns: [workItems.organizationId, workItems.workOrderId, workItems.id],
        }).onDelete("restrict"),
        index("receipt_items_org_item_idx").on(table.organizationId, table.workItemId),
    ],
);

// Every correction records the full before/after operational fact. The first receipt remains recoverable.
export const receiptCorrections = pgTable(
    "receipt_corrections",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        workOrderId: uuid("work_order_id").notNull(),
        receiptId: uuid("receipt_id").notNull(),
        version: integer("version").notNull(),
        kind: receiptCorrectionKind("kind").notNull(),
        beforeSnapshot: jsonb("before_snapshot").notNull(),
        afterSnapshot: jsonb("after_snapshot").notNull(),
        reason: text("reason").notNull(),
        idempotencyKey: uuid("idempotency_key").notNull(),
        payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
        correctedByUserId: uuid("corrected_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        correctedAt: timestamp("corrected_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("receipt_corrections_org_receipt_version_unique").on(
            table.organizationId,
            table.receiptId,
            table.version,
        ),
        unique("receipt_corrections_org_idempotency_unique").on(
            table.organizationId,
            table.idempotencyKey,
        ),
        foreignKey({
            name: "receipt_corrections_receipt_fk",
            columns: [table.organizationId, table.workOrderId, table.receiptId],
            foreignColumns: [receipts.organizationId, receipts.workOrderId, receipts.id],
        }).onDelete("restrict"),
        check("receipt_corrections_version", sql`${table.version} > 1`),
        check("receipt_corrections_reason_not_blank", sql`char_length(btrim(${table.reason})) > 0`),
        check("receipt_corrections_hash", sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
        check(
            "receipt_corrections_snapshots_object",
            sql`jsonb_typeof(${table.beforeSnapshot}) = 'object' AND jsonb_typeof(${table.afterSnapshot}) = 'object'`,
        ),
    ],
);

export type Receipt = typeof receipts.$inferSelect;
