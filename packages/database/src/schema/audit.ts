import { sql } from "drizzle-orm";
import {
    check,
    index,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./identity";

export const auditActorTypeValues = ["user", "system", "administrator"] as const;
export const auditActorType = pgEnum("audit_actor_type", auditActorTypeValues);

export const auditActionValues = [
    "organization.created",
    "organization.updated",
    "site.created",
    "invitation.created",
    "invitation.cancelled",
    "invitation.accepted",
    "membership.role_changed",
    "membership.suspended",
    "membership.removed",
    "party.created",
    "party.updated",
    "party.roles_changed",
    "party.details_changed",
    "party.archived",
    "party.restored",
    "asset.created",
    "asset.updated",
    "asset.lifecycle_changed",
    "asset.identifier_added",
    "asset.identifier_changed",
    "asset.identifier_retired",
    "asset.archived",
    "asset.restored",
    "asset.relationship_started",
    "asset.relationship_ended",
    "asset.relationship_corrected",
] as const;

export type AuditAction = (typeof auditActionValues)[number];
export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Readonly<Record<string, AuditMetadataValue>>;

export const auditEvents = pgTable(
    "audit_events",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        actorType: auditActorType("actor_type").notNull(),
        actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
        action: varchar("action", { length: 120 }).notNull(),
        resourceType: varchar("resource_type", { length: 80 }).notNull(),
        resourceId: text("resource_id").notNull(),
        traceId: uuid("trace_id").notNull(),
        metadata: jsonb("metadata").$type<AuditMetadata>().default({}).notNull(),
        occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index("audit_events_organization_occurred_id_idx").on(
            table.organizationId,
            table.occurredAt.desc(),
            table.id.desc(),
        ),
        check("audit_events_action_not_blank", sql`char_length(btrim(${table.action})) > 0`),
        check(
            "audit_events_resource_type_not_blank",
            sql`char_length(btrim(${table.resourceType})) > 0`,
        ),
        check(
            "audit_events_resource_id_not_blank",
            sql`char_length(btrim(${table.resourceId})) > 0`,
        ),
        check("audit_events_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
        check("audit_events_metadata_size", sql`octet_length(${table.metadata}::text) <= 8192`),
        check(
            "audit_events_actor_check",
            sql`
                (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
                OR (${table.actorType} IN ('user', 'administrator') AND ${table.actorUserId} IS NOT NULL)
            `,
        ),
    ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type AuditActorType = (typeof auditActorTypeValues)[number];
