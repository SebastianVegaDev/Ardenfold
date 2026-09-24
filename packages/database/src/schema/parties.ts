import { relations, sql } from "drizzle-orm";
import {
    boolean,
    check,
    foreignKey,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { organizations } from "./identity";

export const partyKindValues = ["organization", "individual"] as const;
export const partyRoleValues = ["customer", "provider"] as const;
export const partyStatusValues = ["active", "archived"] as const;
export const contactChannelTypeValues = ["email", "phone", "other"] as const;

export const partyKind = pgEnum("party_kind", partyKindValues);
export const partyRole = pgEnum("party_role", partyRoleValues);
export const partyStatus = pgEnum("party_status", partyStatusValues);
export const contactChannelType = pgEnum("contact_channel_type", contactChannelTypeValues);

function timestamps() {
    return {
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    };
}

export const parties = pgTable(
    "parties",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        kind: partyKind("kind").notNull(),
        displayName: varchar("display_name", { length: 200 }).notNull(),
        legalName: varchar("legal_name", { length: 200 }),
        status: partyStatus("status").default("active").notNull(),
        version: integer("version").default(1).notNull(),
        archivedAt: timestamp("archived_at", { withTimezone: true }),
        ...timestamps(),
    },
    (table) => [
        unique("parties_organization_id_id_unique").on(table.organizationId, table.id),
        index("parties_organization_status_name_id_idx").on(
            table.organizationId,
            table.status,
            table.displayName,
            table.id,
        ),
        check("parties_display_name_not_blank", sql`char_length(btrim(${table.displayName})) > 0`),
        check(
            "parties_legal_name_not_blank",
            sql`${table.legalName} IS NULL OR char_length(btrim(${table.legalName})) > 0`,
        ),
        check("parties_version_positive", sql`${table.version} > 0`),
        check(
            "parties_archive_state",
            sql`(${table.status} = 'active' AND ${table.archivedAt} IS NULL) OR (${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL)`,
        ),
    ],
);

export const partyRoles = pgTable(
    "party_roles",
    {
        organizationId: uuid("organization_id").notNull(),
        partyId: uuid("party_id").notNull(),
        role: partyRole("role").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        primaryKey({
            name: "party_roles_pk",
            columns: [table.organizationId, table.partyId, table.role],
        }),
        foreignKey({
            name: "party_roles_party_fk",
            columns: [table.organizationId, table.partyId],
            foreignColumns: [parties.organizationId, parties.id],
        }).onDelete("restrict"),
    ],
);

export const partyIdentifiers = pgTable(
    "party_identifiers",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        partyId: uuid("party_id").notNull(),
        type: varchar("type", { length: 64 }).notNull(),
        originalValue: varchar("original_value", { length: 255 }).notNull(),
        normalizedValue: varchar("normalized_value", { length: 255 }).notNull(),
        ...timestamps(),
    },
    (table) => [
        foreignKey({
            name: "party_identifiers_party_fk",
            columns: [table.organizationId, table.partyId],
            foreignColumns: [parties.organizationId, parties.id],
        }).onDelete("restrict"),
        index("party_identifiers_org_type_normalized_idx").on(
            table.organizationId,
            table.type,
            table.normalizedValue,
        ),
        index("party_identifiers_org_party_idx").on(table.organizationId, table.partyId),
        check("party_identifiers_type_not_blank", sql`char_length(btrim(${table.type})) > 0`),
        check(
            "party_identifiers_original_not_blank",
            sql`char_length(btrim(${table.originalValue})) > 0`,
        ),
        check(
            "party_identifiers_normalized_not_blank",
            sql`char_length(btrim(${table.normalizedValue})) > 0`,
        ),
    ],
);

export const partyContacts = pgTable(
    "party_contacts",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        partyId: uuid("party_id").notNull(),
        displayName: varchar("display_name", { length: 200 }).notNull(),
        jobTitle: varchar("job_title", { length: 120 }),
        isPrimary: boolean("is_primary").default(false).notNull(),
        ...timestamps(),
    },
    (table) => [
        unique("party_contacts_organization_id_id_unique").on(table.organizationId, table.id),
        foreignKey({
            name: "party_contacts_party_fk",
            columns: [table.organizationId, table.partyId],
            foreignColumns: [parties.organizationId, parties.id],
        }).onDelete("restrict"),
        index("party_contacts_org_party_idx").on(table.organizationId, table.partyId),
        check(
            "party_contacts_display_name_not_blank",
            sql`char_length(btrim(${table.displayName})) > 0`,
        ),
        check(
            "party_contacts_job_title_not_blank",
            sql`${table.jobTitle} IS NULL OR char_length(btrim(${table.jobTitle})) > 0`,
        ),
    ],
);

export const partyContactChannels = pgTable(
    "party_contact_channels",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        contactId: uuid("contact_id").notNull(),
        type: contactChannelType("type").notNull(),
        label: varchar("label", { length: 80 }),
        value: varchar("value", { length: 320 }).notNull(),
        ...timestamps(),
    },
    (table) => [
        foreignKey({
            name: "party_contact_channels_contact_fk",
            columns: [table.organizationId, table.contactId],
            foreignColumns: [partyContacts.organizationId, partyContacts.id],
        }).onDelete("restrict"),
        index("party_contact_channels_org_contact_idx").on(table.organizationId, table.contactId),
        check(
            "party_contact_channels_value_not_blank",
            sql`char_length(btrim(${table.value})) > 0`,
        ),
        check(
            "party_contact_channels_label_not_blank",
            sql`${table.label} IS NULL OR char_length(btrim(${table.label})) > 0`,
        ),
    ],
);

export const partyAddresses = pgTable(
    "party_addresses",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        partyId: uuid("party_id").notNull(),
        label: varchar("label", { length: 80 }).notNull(),
        line1: varchar("line_1", { length: 200 }).notNull(),
        line2: varchar("line_2", { length: 200 }),
        locality: varchar("locality", { length: 120 }).notNull(),
        region: varchar("region", { length: 120 }),
        postalCode: varchar("postal_code", { length: 32 }),
        countryCode: varchar("country_code", { length: 2 }).notNull(),
        ...timestamps(),
    },
    (table) => [
        unique("party_addresses_organization_id_id_unique").on(table.organizationId, table.id),
        foreignKey({
            name: "party_addresses_party_fk",
            columns: [table.organizationId, table.partyId],
            foreignColumns: [parties.organizationId, parties.id],
        }).onDelete("restrict"),
        index("party_addresses_org_party_idx").on(table.organizationId, table.partyId),
        check("party_addresses_label_not_blank", sql`char_length(btrim(${table.label})) > 0`),
        check("party_addresses_line_1_not_blank", sql`char_length(btrim(${table.line1})) > 0`),
        check("party_addresses_locality_not_blank", sql`char_length(btrim(${table.locality})) > 0`),
        check("party_addresses_country_code_format", sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
        check(
            "party_addresses_line_2_not_blank",
            sql`${table.line2} IS NULL OR char_length(btrim(${table.line2})) > 0`,
        ),
        check(
            "party_addresses_region_not_blank",
            sql`${table.region} IS NULL OR char_length(btrim(${table.region})) > 0`,
        ),
        check(
            "party_addresses_postal_code_not_blank",
            sql`${table.postalCode} IS NULL OR char_length(btrim(${table.postalCode})) > 0`,
        ),
    ],
);

export const partiesRelations = relations(parties, ({ many }) => ({
    roles: many(partyRoles),
    identifiers: many(partyIdentifiers),
    contacts: many(partyContacts),
    addresses: many(partyAddresses),
}));
export const partyRolesRelations = relations(partyRoles, ({ one }) => ({
    party: one(parties, { fields: [partyRoles.partyId], references: [parties.id] }),
}));
export const partyIdentifiersRelations = relations(partyIdentifiers, ({ one }) => ({
    party: one(parties, { fields: [partyIdentifiers.partyId], references: [parties.id] }),
}));
export const partyContactsRelations = relations(partyContacts, ({ one, many }) => ({
    party: one(parties, { fields: [partyContacts.partyId], references: [parties.id] }),
    channels: many(partyContactChannels),
}));
export const partyContactChannelsRelations = relations(partyContactChannels, ({ one }) => ({
    contact: one(partyContacts, {
        fields: [partyContactChannels.contactId],
        references: [partyContacts.id],
    }),
}));
export const partyAddressesRelations = relations(partyAddresses, ({ one }) => ({
    party: one(parties, { fields: [partyAddresses.partyId], references: [parties.id] }),
}));

export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type PartyRole = typeof partyRoles.$inferSelect;
export type NewPartyRole = typeof partyRoles.$inferInsert;
export type PartyIdentifier = typeof partyIdentifiers.$inferSelect;
export type NewPartyIdentifier = typeof partyIdentifiers.$inferInsert;
export type PartyContact = typeof partyContacts.$inferSelect;
export type NewPartyContact = typeof partyContacts.$inferInsert;
export type PartyContactChannel = typeof partyContactChannels.$inferSelect;
export type NewPartyContactChannel = typeof partyContactChannels.$inferInsert;
export type PartyAddress = typeof partyAddresses.$inferSelect;
export type NewPartyAddress = typeof partyAddresses.$inferInsert;
