import { relations, sql } from "drizzle-orm";
import {
    check,
    foreignKey,
    index,
    integer,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { organizations } from "./identity";

export const assetLifecycleValues = [
    "registered",
    "in_service",
    "out_of_service",
    "retired",
] as const;
export const assetStatusValues = ["active", "archived"] as const;
export const assetIdentifierStatusValues = ["active", "retired"] as const;

export const assetLifecycle = pgEnum("asset_lifecycle", assetLifecycleValues);
export const assetStatus = pgEnum("asset_status", assetStatusValues);
export const assetIdentifierStatus = pgEnum("asset_identifier_status", assetIdentifierStatusValues);

export const assets = pgTable(
    "assets",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        displayName: varchar("display_name", { length: 200 }).notNull(),
        description: text("description"),
        manufacturer: varchar("manufacturer", { length: 200 }),
        model: varchar("model", { length: 200 }),
        classification: varchar("classification", { length: 120 }),
        lifecycle: assetLifecycle("lifecycle").default("registered").notNull(),
        status: assetStatus("status").default("active").notNull(),
        version: integer("version").default(1).notNull(),
        archivedAt: timestamp("archived_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("assets_organization_id_id_unique").on(table.organizationId, table.id),
        index("assets_organization_status_name_id_idx").on(
            table.organizationId,
            table.status,
            table.displayName,
            table.id,
        ),
        index("assets_organization_lifecycle_idx").on(table.organizationId, table.lifecycle),
        check("assets_display_name_not_blank", sql`char_length(btrim(${table.displayName})) > 0`),
        check(
            "assets_description_not_blank",
            sql`${table.description} IS NULL OR char_length(btrim(${table.description})) > 0`,
        ),
        check(
            "assets_manufacturer_not_blank",
            sql`${table.manufacturer} IS NULL OR char_length(btrim(${table.manufacturer})) > 0`,
        ),
        check(
            "assets_model_not_blank",
            sql`${table.model} IS NULL OR char_length(btrim(${table.model})) > 0`,
        ),
        check(
            "assets_classification_not_blank",
            sql`${table.classification} IS NULL OR char_length(btrim(${table.classification})) > 0`,
        ),
        check("assets_version_positive", sql`${table.version} > 0`),
        check(
            "assets_archive_state",
            sql`(${table.status} = 'active' AND ${table.archivedAt} IS NULL) OR (${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL)`,
        ),
    ],
);

export const assetIdentifiers = pgTable(
    "asset_identifiers",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        assetId: uuid("asset_id").notNull(),
        type: varchar("type", { length: 64 }).notNull(),
        originalValue: varchar("original_value", { length: 255 }).notNull(),
        normalizedValue: varchar("normalized_value", { length: 255 }).notNull(),
        status: assetIdentifierStatus("status").default("active").notNull(),
        retiredAt: timestamp("retired_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        foreignKey({
            name: "asset_identifiers_asset_fk",
            columns: [table.organizationId, table.assetId],
            foreignColumns: [assets.organizationId, assets.id],
        }).onDelete("restrict"),
        index("asset_identifiers_org_asset_status_idx").on(
            table.organizationId,
            table.assetId,
            table.status,
        ),
        index("asset_identifiers_org_type_normalized_idx").on(
            table.organizationId,
            table.type,
            table.normalizedValue,
        ),
        check("asset_identifiers_type_not_blank", sql`char_length(btrim(${table.type})) > 0`),
        check(
            "asset_identifiers_original_not_blank",
            sql`char_length(btrim(${table.originalValue})) > 0`,
        ),
        check(
            "asset_identifiers_normalized_not_blank",
            sql`char_length(btrim(${table.normalizedValue})) > 0`,
        ),
        check(
            "asset_identifiers_retired_state",
            sql`(${table.status} = 'active' AND ${table.retiredAt} IS NULL) OR (${table.status} = 'retired' AND ${table.retiredAt} IS NOT NULL)`,
        ),
    ],
);

export const assetsRelations = relations(assets, ({ many }) => ({
    identifiers: many(assetIdentifiers),
}));
export const assetIdentifiersRelations = relations(assetIdentifiers, ({ one }) => ({
    asset: one(assets, { fields: [assetIdentifiers.assetId], references: [assets.id] }),
}));

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type AssetIdentifier = typeof assetIdentifiers.$inferSelect;
export type NewAssetIdentifier = typeof assetIdentifiers.$inferInsert;
