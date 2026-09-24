import { sql } from "drizzle-orm";
import {
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./identity";

type ImportIssue = { code: string; field: string | null };
type ImportCandidate = { id: string; displayName: string; matchedType: string };

export const registryImportSessions = pgTable(
    "registry_import_sessions",
    {
        id: uuid("id").notNull(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        kind: varchar("kind", { length: 16 }).notNull(),
        templateVersion: integer("template_version").notNull(),
        contentHash: varchar("content_hash", { length: 64 }).notNull(),
        status: varchar("status", { length: 16 }).default("previewed").notNull(),
        totalRows: integer("total_rows").notNull(),
        approvedRows: jsonb("approved_rows").$type<number[] | null>(),
        summary: jsonb("summary").$type<Record<string, number> | null>(),
        leaseUntil: timestamp("lease_until", { withTimezone: true }),
        createdByUserId: uuid("created_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
        completedAt: timestamp("completed_at", { withTimezone: true }),
    },
    (table) => [
        primaryKey({
            name: "registry_import_sessions_pk",
            columns: [table.organizationId, table.id],
        }),
        index("registry_import_sessions_org_created_idx").on(table.organizationId, table.createdAt),
        check("registry_import_sessions_kind_check", sql`${table.kind} IN ('party', 'asset')`),
        check("registry_import_sessions_template_version_check", sql`${table.templateVersion} = 1`),
        check(
            "registry_import_sessions_status_check",
            sql`${table.status} IN ('previewed', 'committing', 'completed')`,
        ),
        check(
            "registry_import_sessions_total_rows_check",
            sql`${table.totalRows} BETWEEN 0 AND 500`,
        ),
    ],
);

export const registryImportRows = pgTable(
    "registry_import_rows",
    {
        organizationId: uuid("organization_id").notNull(),
        sessionId: uuid("session_id").notNull(),
        rowNumber: integer("row_number").notNull(),
        kind: varchar("kind", { length: 16 }).notNull(),
        status: varchar("status", { length: 16 }).notNull(),
        payload: jsonb("payload").$type<Record<string, unknown> | null>(),
        errors: jsonb("errors").$type<ImportIssue[]>().notNull(),
        warnings: jsonb("warnings").$type<ImportIssue[]>().notNull(),
        duplicateCandidates: jsonb("duplicate_candidates").$type<ImportCandidate[]>().notNull(),
        resourceId: uuid("resource_id"),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        primaryKey({
            name: "registry_import_rows_pk",
            columns: [table.organizationId, table.sessionId, table.rowNumber],
        }),
        foreignKey({
            name: "registry_import_rows_session_fk",
            columns: [table.organizationId, table.sessionId],
            foreignColumns: [registryImportSessions.organizationId, registryImportSessions.id],
        }).onDelete("restrict"),
        index("registry_import_rows_session_status_idx").on(
            table.organizationId,
            table.sessionId,
            table.status,
        ),
        check("registry_import_rows_kind_check", sql`${table.kind} IN ('party', 'asset')`),
        check(
            "registry_import_rows_status_check",
            sql`${table.status} IN ('valid', 'rejected', 'committed', 'failed', 'skipped')`,
        ),
        check("registry_import_rows_number_check", sql`${table.rowNumber} BETWEEN 2 AND 501`),
    ],
);

export type RegistryImportSession = typeof registryImportSessions.$inferSelect;
export type RegistryImportRow = typeof registryImportRows.$inferSelect;
