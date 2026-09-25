import { relations, sql } from "drizzle-orm";
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
import { organizationSites, organizations, users } from "../identity";
import { parties, partyContacts, partyRole, partyRoles } from "../parties";

export const serviceRequestStatusValues = ["active", "cancelled", "closed"] as const;
export const serviceRequestHistoryKindValues = [
    "created",
    "updated",
    "cancelled",
    "closed",
] as const;

export const serviceRequestStatus = pgEnum("service_request_status", serviceRequestStatusValues);
export const serviceRequestHistoryKind = pgEnum(
    "service_request_history_kind",
    serviceRequestHistoryKindValues,
);

export const serviceRequests = pgTable(
    "service_requests",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        customerPartyId: uuid("customer_party_id").notNull(),
        // This constant makes the customer-role association enforceable by a tenant-qualified FK.
        customerRole: partyRole("customer_role").default("customer").notNull(),
        requesterContactId: uuid("requester_contact_id"),
        requesterName: varchar("requester_name", { length: 200 }),
        siteId: uuid("site_id"),
        summary: varchar("summary", { length: 300 }).notNull(),
        customerContext: text("customer_context"),
        status: serviceRequestStatus("status").default("active").notNull(),
        version: integer("version").default(1).notNull(),
        terminalAt: timestamp("terminal_at", { withTimezone: true }),
        terminalReason: text("terminal_reason"),
        createdByUserId: uuid("created_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        updatedByUserId: uuid("updated_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("service_requests_organization_id_id_unique").on(table.organizationId, table.id),
        foreignKey({
            name: "service_requests_customer_party_fk",
            columns: [table.organizationId, table.customerPartyId],
            foreignColumns: [parties.organizationId, parties.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "service_requests_customer_role_fk",
            columns: [table.organizationId, table.customerPartyId, table.customerRole],
            foreignColumns: [partyRoles.organizationId, partyRoles.partyId, partyRoles.role],
        }).onDelete("restrict"),
        foreignKey({
            name: "service_requests_requester_contact_fk",
            columns: [table.organizationId, table.customerPartyId, table.requesterContactId],
            foreignColumns: [partyContacts.organizationId, partyContacts.partyId, partyContacts.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "service_requests_site_fk",
            columns: [table.organizationId, table.siteId],
            foreignColumns: [organizationSites.organizationId, organizationSites.id],
        }).onDelete("restrict"),
        index("service_requests_org_status_created_id_idx").on(
            table.organizationId,
            table.status,
            table.createdAt,
            table.id,
        ),
        index("service_requests_org_created_id_idx").on(
            table.organizationId,
            table.createdAt.desc(),
            table.id.desc(),
        ),
        index("service_requests_org_customer_created_idx").on(
            table.organizationId,
            table.customerPartyId,
            table.createdAt,
        ),
        check("service_requests_customer_role_check", sql`${table.customerRole} = 'customer'`),
        check("service_requests_summary_not_blank", sql`char_length(btrim(${table.summary})) > 0`),
        check(
            "service_requests_requester_name_not_blank",
            sql`${table.requesterName} IS NULL OR char_length(btrim(${table.requesterName})) > 0`,
        ),
        check(
            "service_requests_customer_context_not_blank",
            sql`${table.customerContext} IS NULL OR char_length(btrim(${table.customerContext})) > 0`,
        ),
        check("service_requests_version_positive", sql`${table.version} > 0`),
        check(
            "service_requests_terminal_state",
            sql`(${table.status} = 'active' AND ${table.terminalAt} IS NULL AND ${table.terminalReason} IS NULL) OR (${table.status} IN ('cancelled', 'closed') AND ${table.terminalAt} IS NOT NULL AND ${table.terminalReason} IS NOT NULL AND char_length(btrim(${table.terminalReason})) > 0)`,
        ),
    ],
);

export const serviceRequestScopeItems = pgTable(
    "service_request_scope_items",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        requestId: uuid("request_id").notNull(),
        position: integer("position").notNull(),
        description: text("description").notNull(),
        assetId: uuid("asset_id"),
        unidentifiedAssetDescription: text("unidentified_asset_description"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("service_request_scope_items_organization_id_id_unique").on(
            table.organizationId,
            table.id,
        ),
        unique("service_request_scope_items_request_position_unique").on(
            table.organizationId,
            table.requestId,
            table.position,
        ),
        foreignKey({
            name: "service_request_scope_items_request_fk",
            columns: [table.organizationId, table.requestId],
            foreignColumns: [serviceRequests.organizationId, serviceRequests.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "service_request_scope_items_asset_fk",
            columns: [table.organizationId, table.assetId],
            foreignColumns: [assets.organizationId, assets.id],
        }).onDelete("restrict"),
        check("service_request_scope_items_position_positive", sql`${table.position} > 0`),
        check(
            "service_request_scope_items_description_not_blank",
            sql`char_length(btrim(${table.description})) > 0`,
        ),
        check(
            "service_request_scope_items_unidentified_asset_not_blank",
            sql`${table.unidentifiedAssetDescription} IS NULL OR char_length(btrim(${table.unidentifiedAssetDescription})) > 0`,
        ),
    ],
);

// Each version records the complete request and scope as understood at that point in time.
// The application writes this in the same transaction as the corresponding mutation.
export const serviceRequestHistoryEntries = pgTable(
    "service_request_history_entries",
    {
        organizationId: uuid("organization_id").notNull(),
        requestId: uuid("request_id").notNull(),
        version: integer("version").notNull(),
        kind: serviceRequestHistoryKind("kind").notNull(),
        snapshot: jsonb("snapshot").notNull(),
        reason: text("reason"),
        recordedByUserId: uuid("recorded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        primaryKey({
            name: "service_request_history_entries_pk",
            columns: [table.organizationId, table.requestId, table.version],
        }),
        foreignKey({
            name: "service_request_history_entries_request_fk",
            columns: [table.organizationId, table.requestId],
            foreignColumns: [serviceRequests.organizationId, serviceRequests.id],
        }).onDelete("restrict"),
        check("service_request_history_entries_version_positive", sql`${table.version} > 0`),
        check(
            "service_request_history_entries_snapshot_object",
            sql`jsonb_typeof(${table.snapshot}) = 'object'`,
        ),
        check(
            "service_request_history_entries_reason_not_blank",
            sql`${table.reason} IS NULL OR char_length(btrim(${table.reason})) > 0`,
        ),
    ],
);

export const serviceRequestsRelations = relations(serviceRequests, ({ many }) => ({
    scopeItems: many(serviceRequestScopeItems),
    history: many(serviceRequestHistoryEntries),
}));

export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type NewServiceRequest = typeof serviceRequests.$inferInsert;
export type ServiceRequestScopeItem = typeof serviceRequestScopeItems.$inferSelect;
export type NewServiceRequestScopeItem = typeof serviceRequestScopeItems.$inferInsert;
export type ServiceRequestHistoryEntry = typeof serviceRequestHistoryEntries.$inferSelect;
export type NewServiceRequestHistoryEntry = typeof serviceRequestHistoryEntries.$inferInsert;
