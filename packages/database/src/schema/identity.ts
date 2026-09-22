import { relations, sql } from "drizzle-orm";
import {
    boolean,
    check,
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { organizationRoles, systemOrganizationRoleIds } from "./authorization";

export const organizationStatusValues = ["active", "suspended", "archived"] as const;
export const membershipStatusValues = ["active", "suspended", "removed"] as const;
export const invitationStatusValues = ["pending", "accepted", "cancelled"] as const;

export const organizationStatus = pgEnum("organization_status", organizationStatusValues);
export const membershipStatus = pgEnum("membership_status", membershipStatusValues);
export const invitationStatus = pgEnum("invitation_status", invitationStatusValues);

function auditTimestamps() {
    return {
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    };
}

export const organizations = pgTable(
    "organizations",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        name: varchar("name", { length: 200 }).notNull(),
        status: organizationStatus("status").default("active").notNull(),
        defaultLocale: varchar("default_locale", { length: 35 }).default("en").notNull(),
        defaultTimeZone: varchar("default_time_zone", { length: 255 }).default("UTC").notNull(),
        ...auditTimestamps(),
    },
    (table) => [
        check("organizations_name_not_blank", sql`char_length(btrim(${table.name})) > 0`),
        check(
            "organizations_default_locale_not_blank",
            sql`char_length(btrim(${table.defaultLocale})) > 0`,
        ),
        check(
            "organizations_default_time_zone_not_blank",
            sql`char_length(btrim(${table.defaultTimeZone})) > 0`,
        ),
        index("organizations_status_idx").on(table.status),
    ],
);

export const users = pgTable(
    "users",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        primaryEmail: varchar("primary_email", { length: 320 }).notNull(),
        displayName: varchar("display_name", { length: 200 }),
        preferredLocale: varchar("preferred_locale", { length: 35 }),
        preferredTimeZone: varchar("preferred_time_zone", { length: 255 }),
        ...auditTimestamps(),
    },
    (table) => [
        check("users_primary_email_not_blank", sql`char_length(btrim(${table.primaryEmail})) > 0`),
        check(
            "users_display_name_not_blank",
            sql`${table.displayName} IS NULL OR char_length(btrim(${table.displayName})) > 0`,
        ),
        check(
            "users_preferred_locale_not_blank",
            sql`${table.preferredLocale} IS NULL OR char_length(btrim(${table.preferredLocale})) > 0`,
        ),
        check(
            "users_preferred_time_zone_not_blank",
            sql`${table.preferredTimeZone} IS NULL OR char_length(btrim(${table.preferredTimeZone})) > 0`,
        ),
    ],
);

export const externalIdentities = pgTable(
    "external_identities",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        provider: varchar("provider", { length: 64 }).notNull(),
        issuer: text("issuer").notNull(),
        subject: text("subject").notNull(),
        lastAuthenticatedAt: timestamp("last_authenticated_at", { withTimezone: true }),
        ...auditTimestamps(),
    },
    (table) => [
        uniqueIndex("external_identities_provider_issuer_subject_uidx").on(
            table.provider,
            table.issuer,
            table.subject,
        ),
        index("external_identities_user_id_idx").on(table.userId),
        check(
            "external_identities_provider_not_blank",
            sql`char_length(btrim(${table.provider})) > 0`,
        ),
        check("external_identities_issuer_not_blank", sql`char_length(btrim(${table.issuer})) > 0`),
        check(
            "external_identities_subject_not_blank",
            sql`char_length(btrim(${table.subject})) > 0`,
        ),
    ],
);

export const organizationSites = pgTable(
    "organization_sites",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        name: varchar("name", { length: 200 }).notNull(),
        code: varchar("code", { length: 64 }),
        timeZone: varchar("time_zone", { length: 255 }),
        isActive: boolean("is_active").default(true).notNull(),
        ...auditTimestamps(),
    },
    (table) => [
        index("organization_sites_organization_id_idx").on(table.organizationId),
        uniqueIndex("organization_sites_organization_id_code_uidx")
            .on(table.organizationId, table.code)
            .where(sql`${table.code} IS NOT NULL`),
        check("organization_sites_name_not_blank", sql`char_length(btrim(${table.name})) > 0`),
        check(
            "organization_sites_code_not_blank",
            sql`${table.code} IS NULL OR char_length(btrim(${table.code})) > 0`,
        ),
        check(
            "organization_sites_time_zone_not_blank",
            sql`${table.timeZone} IS NULL OR char_length(btrim(${table.timeZone})) > 0`,
        ),
    ],
);

export const organizationMemberships = pgTable(
    "organization_memberships",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        roleId: uuid("role_id")
            .default(systemOrganizationRoleIds.viewer)
            .notNull()
            .references(() => organizationRoles.id, { onDelete: "restrict" }),
        status: membershipStatus("status").default("active").notNull(),
        activatedAt: timestamp("activated_at", { withTimezone: true }).defaultNow().notNull(),
        suspendedAt: timestamp("suspended_at", { withTimezone: true }),
        removedAt: timestamp("removed_at", { withTimezone: true }),
        ...auditTimestamps(),
    },
    (table) => [
        uniqueIndex("organization_memberships_organization_id_user_id_uidx").on(
            table.organizationId,
            table.userId,
        ),
        index("organization_memberships_organization_id_status_idx").on(
            table.organizationId,
            table.status,
        ),
        index("organization_memberships_user_id_status_idx").on(table.userId, table.status),
        check(
            "organization_memberships_lifecycle_check",
            sql`
                (${table.status} = 'active' AND ${table.suspendedAt} IS NULL AND ${table.removedAt} IS NULL)
                OR (${table.status} = 'suspended' AND ${table.suspendedAt} IS NOT NULL AND ${table.removedAt} IS NULL)
                OR (${table.status} = 'removed' AND ${table.removedAt} IS NOT NULL)
            `,
        ),
    ],
);

export const organizationInvitations = pgTable(
    "organization_invitations",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        email: varchar("email", { length: 320 }).notNull(),
        roleId: uuid("role_id")
            .notNull()
            .references(() => organizationRoles.id, { onDelete: "restrict" }),
        tokenHash: varchar("token_hash", { length: 64 }).notNull(),
        status: invitationStatus("status").default("pending").notNull(),
        invitedByUserId: uuid("invited_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        acceptedAt: timestamp("accepted_at", { withTimezone: true }),
        cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
        ...auditTimestamps(),
    },
    (table) => [
        uniqueIndex("organization_invitations_token_hash_uidx").on(table.tokenHash),
        uniqueIndex("organization_invitations_pending_email_uidx")
            .on(table.organizationId, table.email)
            .where(sql`${table.status} = 'pending'`),
        index("organization_invitations_organization_status_idx").on(
            table.organizationId,
            table.status,
        ),
        check(
            "organization_invitations_email_normalized",
            sql`${table.email} = lower(btrim(${table.email}))`,
        ),
        check(
            "organization_invitations_token_hash_format",
            sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
        ),
        check(
            "organization_invitations_lifecycle_check",
            sql`
                (${table.status} = 'pending' AND ${table.acceptedByUserId} IS NULL AND ${table.acceptedAt} IS NULL AND ${table.cancelledAt} IS NULL)
                OR (${table.status} = 'accepted' AND ${table.acceptedByUserId} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL)
                OR (${table.status} = 'cancelled' AND ${table.acceptedByUserId} IS NULL AND ${table.acceptedAt} IS NULL AND ${table.cancelledAt} IS NOT NULL)
            `,
        ),
        check(
            "organization_invitations_expiry_after_creation",
            sql`${table.expiresAt} > ${table.createdAt}`,
        ),
    ],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
    sites: many(organizationSites),
    memberships: many(organizationMemberships),
    invitations: many(organizationInvitations),
}));

export const organizationInvitationsRelations = relations(organizationInvitations, ({ one }) => ({
    organization: one(organizations, {
        fields: [organizationInvitations.organizationId],
        references: [organizations.id],
    }),
    role: one(organizationRoles, {
        fields: [organizationInvitations.roleId],
        references: [organizationRoles.id],
    }),
    invitedBy: one(users, {
        fields: [organizationInvitations.invitedByUserId],
        references: [users.id],
        relationName: "invitationInviter",
    }),
    acceptedBy: one(users, {
        fields: [organizationInvitations.acceptedByUserId],
        references: [users.id],
        relationName: "invitationAcceptor",
    }),
}));

export const usersRelations = relations(users, ({ many }) => ({
    externalIdentities: many(externalIdentities),
    organizationMemberships: many(organizationMemberships),
}));

export const externalIdentitiesRelations = relations(externalIdentities, ({ one }) => ({
    user: one(users, {
        fields: [externalIdentities.userId],
        references: [users.id],
    }),
}));

export const organizationSitesRelations = relations(organizationSites, ({ one }) => ({
    organization: one(organizations, {
        fields: [organizationSites.organizationId],
        references: [organizations.id],
    }),
}));

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
    organization: one(organizations, {
        fields: [organizationMemberships.organizationId],
        references: [organizations.id],
    }),
    user: one(users, {
        fields: [organizationMemberships.userId],
        references: [users.id],
    }),
    role: one(organizationRoles, {
        fields: [organizationMemberships.roleId],
        references: [organizationRoles.id],
    }),
}));

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ExternalIdentity = typeof externalIdentities.$inferSelect;
export type NewExternalIdentity = typeof externalIdentities.$inferInsert;
export type OrganizationSite = typeof organizationSites.$inferSelect;
export type NewOrganizationSite = typeof organizationSites.$inferInsert;
export type OrganizationMembership = typeof organizationMemberships.$inferSelect;
export type NewOrganizationMembership = typeof organizationMemberships.$inferInsert;
export type OrganizationStatus = (typeof organizationStatusValues)[number];
export type MembershipStatus = (typeof membershipStatusValues)[number];
export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type NewOrganizationInvitation = typeof organizationInvitations.$inferInsert;
export type InvitationStatus = (typeof invitationStatusValues)[number];
