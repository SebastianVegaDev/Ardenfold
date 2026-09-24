import { relations, sql } from "drizzle-orm";
import {
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { assets } from "./assets";
import { organizationSites, users } from "./identity";
import { parties, partyAddresses } from "./parties";

export const assetRelationshipKindValues = ["ownership", "custody", "location"] as const;
export const assetRelationshipSubjectValues = [
    "party",
    "recording_organization",
    "site",
    "party_address",
    "freeform",
] as const;
export const assetHistoryEventValues = [
    "asset_created",
    "asset_updated",
    "lifecycle_changed",
    "identifier_added",
    "identifier_changed",
    "identifier_retired",
    "asset_archived",
    "asset_restored",
    "relationship_started",
    "relationship_ended",
    "relationship_corrected",
] as const;

export const assetRelationshipKind = pgEnum("asset_relationship_kind", assetRelationshipKindValues);
export const assetRelationshipSubject = pgEnum(
    "asset_relationship_subject",
    assetRelationshipSubjectValues,
);
export const assetHistoryEvent = pgEnum("asset_history_event", assetHistoryEventValues);

export const assetRelationships = pgTable(
    "asset_relationships",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        assetId: uuid("asset_id").notNull(),
        kind: assetRelationshipKind("kind").notNull(),
        subject: assetRelationshipSubject("subject").notNull(),
        partyId: uuid("party_id"),
        siteId: uuid("site_id"),
        partyAddressId: uuid("party_address_id"),
        locationDescription: varchar("location_description", { length: 500 }),
        effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
        effectiveTo: timestamp("effective_to", { withTimezone: true }),
        supersedesId: uuid("supersedes_id"),
        supersededAt: timestamp("superseded_at", { withTimezone: true }),
        revisionReason: varchar("revision_reason", { length: 500 }),
        aggregateVersion: integer("aggregate_version").notNull(),
        recordedByUserId: uuid("recorded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("asset_relationships_org_asset_id_unique").on(
            table.organizationId,
            table.assetId,
            table.id,
        ),
        foreignKey({
            name: "asset_relationships_asset_fk",
            columns: [table.organizationId, table.assetId],
            foreignColumns: [assets.organizationId, assets.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "asset_relationships_party_fk",
            columns: [table.organizationId, table.partyId],
            foreignColumns: [parties.organizationId, parties.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "asset_relationships_site_fk",
            columns: [table.organizationId, table.siteId],
            foreignColumns: [organizationSites.organizationId, organizationSites.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "asset_relationships_address_fk",
            columns: [table.organizationId, table.partyAddressId],
            foreignColumns: [partyAddresses.organizationId, partyAddresses.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "asset_relationships_supersedes_fk",
            columns: [table.organizationId, table.assetId, table.supersedesId],
            foreignColumns: [table.organizationId, table.assetId, table.id],
        }).onDelete("restrict"),
        index("asset_relationships_org_asset_kind_from_idx").on(
            table.organizationId,
            table.assetId,
            table.kind,
            table.effectiveFrom,
        ),
        uniqueIndex("asset_relationships_current_unique")
            .on(table.organizationId, table.assetId, table.kind)
            .where(sql`${table.effectiveTo} IS NULL AND ${table.supersededAt} IS NULL`),
        check(
            "asset_relationships_interval_order",
            sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} > ${table.effectiveFrom}`,
        ),
        check("asset_relationships_aggregate_version_positive", sql`${table.aggregateVersion} > 0`),
        check(
            "asset_relationships_reason_not_blank",
            sql`${table.revisionReason} IS NULL OR char_length(btrim(${table.revisionReason})) > 0`,
        ),
        check(
            "asset_relationships_location_not_blank",
            sql`${table.locationDescription} IS NULL OR char_length(btrim(${table.locationDescription})) > 0`,
        ),
        check(
            "asset_relationships_subject_shape",
            sql`
                (
                    ${table.kind} IN ('ownership', 'custody')
                    AND ${table.locationDescription} IS NULL
                    AND ${table.siteId} IS NULL
                    AND ${table.partyAddressId} IS NULL
                    AND (
                        (${table.subject} = 'party' AND ${table.partyId} IS NOT NULL)
                        OR (${table.subject} = 'recording_organization' AND ${table.partyId} IS NULL)
                    )
                ) OR (
                    ${table.kind} = 'location'
                    AND ${table.partyId} IS NULL
                    AND ${table.locationDescription} IS NOT NULL
                    AND (
                        (${table.subject} = 'site' AND ${table.siteId} IS NOT NULL AND ${table.partyAddressId} IS NULL)
                        OR (${table.subject} = 'party_address' AND ${table.partyAddressId} IS NOT NULL AND ${table.siteId} IS NULL)
                        OR (${table.subject} = 'freeform' AND ${table.siteId} IS NULL AND ${table.partyAddressId} IS NULL)
                    )
                )
            `,
        ),
    ],
);

export const assetHistoryEntries = pgTable(
    "asset_history_entries",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        assetId: uuid("asset_id").notNull(),
        event: assetHistoryEvent("event").notNull(),
        aggregateVersion: integer("aggregate_version").notNull(),
        actorUserId: uuid("actor_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        traceId: uuid("trace_id").notNull(),
        source: varchar("source", { length: 64 }).default("asset_registry").notNull(),
        sourceReferenceId: uuid("source_reference_id"),
        payload: jsonb("payload")
            .$type<Record<string, string | number | boolean | null>>()
            .notNull(),
        occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        foreignKey({
            name: "asset_history_entries_asset_fk",
            columns: [table.organizationId, table.assetId],
            foreignColumns: [assets.organizationId, assets.id],
        }).onDelete("restrict"),
        index("asset_history_entries_org_asset_occurred_idx").on(
            table.organizationId,
            table.assetId,
            table.occurredAt,
            table.id,
        ),
        check("asset_history_entries_version_positive", sql`${table.aggregateVersion} > 0`),
        check(
            "asset_history_entries_source_not_blank",
            sql`char_length(btrim(${table.source})) > 0`,
        ),
    ],
);

export const assetRelationshipsRelations = relations(assetRelationships, ({ one }) => ({
    asset: one(assets, { fields: [assetRelationships.assetId], references: [assets.id] }),
}));
export const assetHistoryEntriesRelations = relations(assetHistoryEntries, ({ one }) => ({
    asset: one(assets, { fields: [assetHistoryEntries.assetId], references: [assets.id] }),
}));

export type AssetRelationship = typeof assetRelationships.$inferSelect;
export type NewAssetRelationship = typeof assetRelationships.$inferInsert;
export type AssetHistoryEntry = typeof assetHistoryEntries.$inferSelect;
export type NewAssetHistoryEntry = typeof assetHistoryEntries.$inferInsert;
