import { sql } from "drizzle-orm";
import {
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
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { assets } from "../assets";
import { organizationSites, organizations, users } from "../identity";
import { parties } from "../parties";
import { quoteAcceptances, quoteRevisionLines, quoteRevisions, quotes } from "./quotations";
import { serviceRequests } from "./requests";

export const workOrderStatusValues = ["planned", "ready", "cancelled"] as const;
export const workItemStatusValues = ["planned", "ready", "cancelled"] as const;
export const workItemAssetRequirementValues = ["required", "not_applicable"] as const;
export const workItemServiceModeValues = ["physical_intake", "no_intake"] as const;

export const workOrderStatus = pgEnum("work_order_status", workOrderStatusValues);
export const workItemStatus = pgEnum("work_item_status", workItemStatusValues);
export const workItemAssetRequirement = pgEnum(
    "work_item_asset_requirement",
    workItemAssetRequirementValues,
);
export const workItemServiceMode = pgEnum("work_item_service_mode", workItemServiceModeValues);

export const workOrders = pgTable(
    "work_orders",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        requestId: uuid("request_id").notNull(),
        customerPartyId: uuid("customer_party_id").notNull(),
        quoteId: uuid("quote_id").notNull(),
        acceptanceId: uuid("acceptance_id").notNull(),
        acceptedRevisionId: uuid("accepted_revision_id").notNull(),
        siteId: uuid("site_id").notNull(),
        reference: varchar("reference", { length: 80 }).notNull(),
        status: workOrderStatus("status").default("planned").notNull(),
        version: integer("version").default(1).notNull(),
        nextItemNumber: integer("next_item_number").default(1).notNull(),
        // Initial operational allocations only; the revision remains the commercial source.
        initialAllocationSnapshot: jsonb("initial_allocation_snapshot").notNull(),
        preparationNotes: text("preparation_notes"),
        idempotencyKey: uuid("idempotency_key").notNull(),
        payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
        createdByUserId: uuid("created_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        authorizedByUserId: uuid("authorized_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        updatedByUserId: uuid("updated_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        authorizedAt: timestamp("authorized_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
        cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
        cancellationReason: text("cancellation_reason"),
    },
    (table) => [
        unique("work_orders_org_id_unique").on(table.organizationId, table.id),
        unique("work_orders_org_id_revision_unique").on(
            table.organizationId,
            table.id,
            table.acceptedRevisionId,
        ),
        unique("work_orders_org_reference_unique").on(table.organizationId, table.reference),
        unique("work_orders_org_acceptance_unique").on(table.organizationId, table.acceptanceId),
        unique("work_orders_org_idempotency_unique").on(table.organizationId, table.idempotencyKey),
        foreignKey({
            name: "work_orders_request_fk",
            columns: [table.organizationId, table.requestId, table.customerPartyId],
            foreignColumns: [
                serviceRequests.organizationId,
                serviceRequests.id,
                serviceRequests.customerPartyId,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "work_orders_quote_basis_fk",
            columns: [table.organizationId, table.quoteId, table.requestId, table.customerPartyId],
            foreignColumns: [
                quotes.organizationId,
                quotes.id,
                quotes.requestId,
                quotes.customerPartyId,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "work_orders_acceptance_basis_fk",
            columns: [
                table.organizationId,
                table.quoteId,
                table.acceptanceId,
                table.acceptedRevisionId,
            ],
            foreignColumns: [
                quoteAcceptances.organizationId,
                quoteAcceptances.quoteId,
                quoteAcceptances.id,
                quoteAcceptances.revisionId,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "work_orders_revision_fk",
            columns: [table.organizationId, table.quoteId, table.acceptedRevisionId],
            foreignColumns: [
                quoteRevisions.organizationId,
                quoteRevisions.quoteId,
                quoteRevisions.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "work_orders_site_fk",
            columns: [table.organizationId, table.siteId],
            foreignColumns: [organizationSites.organizationId, organizationSites.id],
        }).onDelete("restrict"),
        index("work_orders_org_status_created_idx").on(
            table.organizationId,
            table.status,
            table.createdAt.desc(),
            table.id.desc(),
        ),
        index("work_orders_org_request_created_idx").on(
            table.organizationId,
            table.requestId,
            table.createdAt.desc(),
        ),
        index("work_orders_org_site_status_idx").on(
            table.organizationId,
            table.siteId,
            table.status,
        ),
        check("work_orders_reference_not_blank", sql`char_length(btrim(${table.reference})) > 0`),
        check("work_orders_version_positive", sql`${table.version} > 0`),
        check("work_orders_next_item_positive", sql`${table.nextItemNumber} > 0`),
        check("work_orders_payload_hash", sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
        check(
            "work_orders_allocation_snapshot_object",
            sql`jsonb_typeof(${table.initialAllocationSnapshot}) = 'object'`,
        ),
        check(
            "work_orders_cancellation_state",
            sql`(${table.status} = 'cancelled' AND ${table.cancelledAt} IS NOT NULL AND ${table.cancelledByUserId} IS NOT NULL AND ${table.cancellationReason} IS NOT NULL AND char_length(btrim(${table.cancellationReason})) > 0) OR (${table.status} <> 'cancelled' AND ${table.cancelledAt} IS NULL AND ${table.cancelledByUserId} IS NULL AND ${table.cancellationReason} IS NULL)`,
        ),
    ],
);

export const workItems = pgTable(
    "work_items",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        workOrderId: uuid("work_order_id").notNull(),
        acceptedRevisionId: uuid("accepted_revision_id").notNull(),
        sourceRevisionLineId: uuid("source_revision_line_id").notNull(),
        itemNumber: integer("item_number").notNull(),
        replacesItemId: uuid("replaces_item_id"),
        scopeDescription: text("scope_description").notNull(),
        allocatedQuantity: numeric("allocated_quantity").notNull(),
        allocatedUnit: varchar("allocated_unit", { length: 40 }).notNull(),
        partyId: uuid("party_id"),
        assetRequirement: workItemAssetRequirement("asset_requirement").notNull(),
        assetId: uuid("asset_id"),
        unresolvedAssetDescription: text("unresolved_asset_description"),
        serviceMode: workItemServiceMode("service_mode").notNull(),
        status: workItemStatus("status").default("planned").notNull(),
        version: integer("version").default(1).notNull(),
        preparationNotes: text("preparation_notes"),
        createdByUserId: uuid("created_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        updatedByUserId: uuid("updated_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
        cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
        cancellationReason: text("cancellation_reason"),
    },
    (table) => [
        unique("work_items_org_id_unique").on(table.organizationId, table.id),
        unique("work_items_org_order_id_unique").on(
            table.organizationId,
            table.workOrderId,
            table.id,
        ),
        unique("work_items_org_order_number_unique").on(
            table.organizationId,
            table.workOrderId,
            table.itemNumber,
        ),
        foreignKey({
            name: "work_items_order_revision_fk",
            columns: [table.organizationId, table.workOrderId, table.acceptedRevisionId],
            foreignColumns: [
                workOrders.organizationId,
                workOrders.id,
                workOrders.acceptedRevisionId,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "work_items_accepted_line_fk",
            columns: [table.organizationId, table.acceptedRevisionId, table.sourceRevisionLineId],
            foreignColumns: [
                quoteRevisionLines.organizationId,
                quoteRevisionLines.revisionId,
                quoteRevisionLines.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "work_items_replaces_fk",
            columns: [table.organizationId, table.workOrderId, table.replacesItemId],
            foreignColumns: [table.organizationId, table.workOrderId, table.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "work_items_party_fk",
            columns: [table.organizationId, table.partyId],
            foreignColumns: [parties.organizationId, parties.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "work_items_asset_fk",
            columns: [table.organizationId, table.assetId],
            foreignColumns: [assets.organizationId, assets.id],
        }).onDelete("restrict"),
        index("work_items_org_order_status_number_idx").on(
            table.organizationId,
            table.workOrderId,
            table.status,
            table.itemNumber,
        ),
        index("work_items_org_asset_status_idx").on(
            table.organizationId,
            table.assetId,
            table.status,
        ),
        index("work_items_org_planned_created_id_idx")
            .on(table.organizationId, table.createdAt, table.id)
            .where(sql`${table.status} = 'planned'`),
        check("work_items_number_positive", sql`${table.itemNumber} > 0`),
        check("work_items_version_positive", sql`${table.version} > 0`),
        check("work_items_scope_not_blank", sql`char_length(btrim(${table.scopeDescription})) > 0`),
        check("work_items_unit_not_blank", sql`char_length(btrim(${table.allocatedUnit})) > 0`),
        check(
            "work_items_quantity_precision",
            sql`${table.allocatedQuantity} > 0 AND ${table.allocatedQuantity} < 1000000000000 AND ${table.allocatedQuantity} = round(${table.allocatedQuantity}, 6)`,
        ),
        check(
            "work_items_asset_state",
            sql`(${table.assetRequirement} = 'not_applicable' AND ${table.assetId} IS NULL AND ${table.unresolvedAssetDescription} IS NULL AND ${table.serviceMode} = 'no_intake') OR (${table.assetRequirement} = 'required' AND (${table.assetId} IS NOT NULL OR (${table.unresolvedAssetDescription} IS NOT NULL AND char_length(btrim(${table.unresolvedAssetDescription})) > 0)))`,
        ),
        check(
            "work_items_unresolved_not_blank",
            sql`${table.unresolvedAssetDescription} IS NULL OR char_length(btrim(${table.unresolvedAssetDescription})) > 0`,
        ),
        check(
            "work_items_cancellation_state",
            sql`(${table.status} = 'cancelled' AND ${table.cancelledAt} IS NOT NULL AND ${table.cancelledByUserId} IS NOT NULL AND ${table.cancellationReason} IS NOT NULL AND char_length(btrim(${table.cancellationReason})) > 0) OR (${table.status} <> 'cancelled' AND ${table.cancelledAt} IS NULL AND ${table.cancelledByUserId} IS NULL AND ${table.cancellationReason} IS NULL)`,
        ),
        check(
            "work_items_no_self_replacement",
            sql`${table.replacesItemId} IS NULL OR ${table.replacesItemId} <> ${table.id}`,
        ),
    ],
);

export const workOrderHistoryEntries = pgTable(
    "work_order_history_entries",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        workOrderId: uuid("work_order_id").notNull(),
        version: integer("version").notNull(),
        kind: varchar("kind", { length: 80 }).notNull(),
        snapshot: jsonb("snapshot").notNull(),
        reason: text("reason"),
        recordedByUserId: uuid("recorded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("work_order_history_org_order_version_unique").on(
            table.organizationId,
            table.workOrderId,
            table.version,
        ),
        foreignKey({
            name: "work_order_history_order_fk",
            columns: [table.organizationId, table.workOrderId],
            foreignColumns: [workOrders.organizationId, workOrders.id],
        }).onDelete("restrict"),
        check("work_order_history_version_positive", sql`${table.version} > 0`),
        check(
            "work_order_history_snapshot_object",
            sql`jsonb_typeof(${table.snapshot}) = 'object'`,
        ),
        check("work_order_history_kind_not_blank", sql`char_length(btrim(${table.kind})) > 0`),
    ],
);

export const workItemHistoryEntries = pgTable(
    "work_item_history_entries",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        workOrderId: uuid("work_order_id").notNull(),
        workItemId: uuid("work_item_id").notNull(),
        version: integer("version").notNull(),
        kind: varchar("kind", { length: 80 }).notNull(),
        snapshot: jsonb("snapshot").notNull(),
        reason: text("reason"),
        recordedByUserId: uuid("recorded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("work_item_history_org_item_version_unique").on(
            table.organizationId,
            table.workItemId,
            table.version,
        ),
        foreignKey({
            name: "work_item_history_item_fk",
            columns: [table.organizationId, table.workOrderId, table.workItemId],
            foreignColumns: [workItems.organizationId, workItems.workOrderId, workItems.id],
        }).onDelete("restrict"),
        check("work_item_history_version_positive", sql`${table.version} > 0`),
        check("work_item_history_snapshot_object", sql`jsonb_typeof(${table.snapshot}) = 'object'`),
        check("work_item_history_kind_not_blank", sql`char_length(btrim(${table.kind})) > 0`),
    ],
);

export type WorkOrder = typeof workOrders.$inferSelect;
export type WorkItem = typeof workItems.$inferSelect;
