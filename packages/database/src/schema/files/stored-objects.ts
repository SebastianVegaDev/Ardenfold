import { sql } from "drizzle-orm";
import {
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { organizations, users } from "../identity";

export const storedObjectStatusValues = ["pending", "uploaded", "finalized", "abandoned"] as const;
export const storedObjectStatus = pgEnum("stored_object_status", storedObjectStatusValues);

export const storedObjects = pgTable(
    "stored_objects",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        storageKey: varchar("storage_key", { length: 160 }).notNull(),
        status: storedObjectStatus("status").default("pending").notNull(),
        originalFilename: varchar("original_filename", { length: 240 }).notNull(),
        declaredMediaType: varchar("declared_media_type", { length: 100 }).notNull(),
        mediaType: varchar("media_type", { length: 100 }),
        expectedByteLength: integer("expected_byte_length").notNull(),
        expectedSha256: varchar("expected_sha256", { length: 64 }).notNull(),
        byteLength: integer("byte_length"),
        sha256: varchar("sha256", { length: 64 }),
        idempotencyKey: uuid("idempotency_key").notNull(),
        requestHash: varchar("request_hash", { length: 64 }).notNull(),
        uploadedByUserId: uuid("uploaded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
        finalizedAt: timestamp("finalized_at", { withTimezone: true }),
        retainedAt: timestamp("retained_at", { withTimezone: true }),
        abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    },
    (table) => [
        unique("stored_objects_org_id_unique").on(table.organizationId, table.id),
        unique("stored_objects_storage_key_unique").on(table.storageKey),
        unique("stored_objects_org_command_unique").on(table.organizationId, table.idempotencyKey),
        index("stored_objects_cleanup_idx").on(table.status, table.createdAt),
        index("stored_objects_org_uploader_created_idx").on(
            table.organizationId,
            table.uploadedByUserId,
            table.createdAt.desc(),
        ),
        check(
            "stored_objects_filename_not_blank",
            sql`char_length(btrim(${table.originalFilename})) > 0`,
        ),
        check(
            "stored_objects_declared_type_not_blank",
            sql`char_length(btrim(${table.declaredMediaType})) > 0`,
        ),
        check(
            "stored_objects_expected_length",
            sql`${table.expectedByteLength} BETWEEN 1 AND 10485760`,
        ),
        check("stored_objects_expected_sha256", sql`${table.expectedSha256} ~ '^[a-f0-9]{64}$'`),
        check("stored_objects_request_hash", sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`),
        check(
            "stored_objects_sha256",
            sql`${table.sha256} IS NULL OR ${table.sha256} ~ '^[a-f0-9]{64}$'`,
        ),
        check(
            "stored_objects_byte_length",
            sql`${table.byteLength} IS NULL OR ${table.byteLength} BETWEEN 1 AND 10485760`,
        ),
        check(
            "stored_objects_lifecycle_fields",
            sql`(${table.status} = 'pending' AND ${table.byteLength} IS NULL AND ${table.sha256} IS NULL AND ${table.mediaType} IS NULL AND ${table.uploadedAt} IS NULL AND ${table.finalizedAt} IS NULL AND ${table.abandonedAt} IS NULL AND ${table.retainedAt} IS NULL)
             OR (${table.status} = 'uploaded' AND ${table.byteLength} IS NOT NULL AND ${table.sha256} IS NOT NULL AND ${table.mediaType} IS NOT NULL AND ${table.uploadedAt} IS NOT NULL AND ${table.finalizedAt} IS NULL AND ${table.abandonedAt} IS NULL AND ${table.retainedAt} IS NULL)
             OR (${table.status} = 'finalized' AND ${table.byteLength} IS NOT NULL AND ${table.sha256} IS NOT NULL AND ${table.mediaType} IS NOT NULL AND ${table.uploadedAt} IS NOT NULL AND ${table.finalizedAt} IS NOT NULL AND ${table.abandonedAt} IS NULL)
             OR (${table.status} = 'abandoned' AND ${table.abandonedAt} IS NOT NULL AND ${table.retainedAt} IS NULL)`,
        ),
    ],
);
