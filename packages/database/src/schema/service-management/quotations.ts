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
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { assets } from "../assets";
import { organizations, users } from "../identity";
import { parties, partyContacts } from "../parties";
import { serviceRequests } from "./requests";

export const quoteStatusValues = ["open", "accepted", "closed"] as const;
export const quoteRevisionStatusValues = [
    "draft",
    "offered",
    "discarded",
    "accepted",
    "rejected",
    "expired",
    "superseded",
    "withdrawn",
] as const;
export const quoteStatus = pgEnum("quote_status", quoteStatusValues);
export const quoteRevisionStatus = pgEnum("quote_revision_status", quoteRevisionStatusValues);

// PostgreSQL numeric remains a string in TypeScript. No financial value passes through number.
// An unconstrained numeric preserves the submitted precision until CHECK constraints run.
// PostgreSQL numeric(p,s) rounds excess fractional digits before a CHECK can reject them.
const money = (name: string) => numeric(name);
const decimalInput = (name: string) => numeric(name);

export const quotes = pgTable(
    "quotes",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "restrict" }),
        requestId: uuid("request_id").notNull(),
        customerPartyId: uuid("customer_party_id").notNull(),
        reference: varchar("reference", { length: 80 }).notNull(),
        status: quoteStatus("status").default("open").notNull(),
        version: integer("version").default(1).notNull(),
        nextRevisionNumber: integer("next_revision_number").default(1).notNull(),
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
        unique("quotes_organization_id_id_unique").on(table.organizationId, table.id),
        unique("quotes_org_reference_unique").on(table.organizationId, table.reference),
        foreignKey({
            name: "quotes_request_fk",
            columns: [table.organizationId, table.requestId, table.customerPartyId],
            foreignColumns: [
                serviceRequests.organizationId,
                serviceRequests.id,
                serviceRequests.customerPartyId,
            ],
        }).onDelete("restrict"),
        index("quotes_org_request_created_idx").on(
            table.organizationId,
            table.requestId,
            table.createdAt.desc(),
            table.id.desc(),
        ),
        index("quotes_org_status_created_idx").on(
            table.organizationId,
            table.status,
            table.createdAt.desc(),
            table.id.desc(),
        ),
        check("quotes_reference_not_blank", sql`char_length(btrim(${table.reference})) > 0`),
        check("quotes_version_positive", sql`${table.version} > 0`),
        check("quotes_next_revision_positive", sql`${table.nextRevisionNumber} > 0`),
    ],
);

export const quoteRevisions = pgTable(
    "quote_revisions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        quoteId: uuid("quote_id").notNull(),
        revisionNumber: integer("revision_number").notNull(),
        sourceRevisionId: uuid("source_revision_id"),
        supersededByRevisionId: uuid("superseded_by_revision_id"),
        status: quoteRevisionStatus("status").default("draft").notNull(),
        version: integer("version").default(1).notNull(),
        sourceRequestVersion: integer("source_request_version").notNull(),
        currencyCode: varchar("currency_code", { length: 3 }).notNull(),
        currencyScale: integer("currency_scale").notNull(),
        calculationPolicyVersion: integer("calculation_policy_version").default(1).notNull(),
        paymentTerms: text("payment_terms"),
        deliveryTerms: text("delivery_terms"),
        serviceLocation: text("service_location"),
        intakeExpectations: text("intake_expectations"),
        exclusions: text("exclusions"),
        validUntil: timestamp("valid_until", { withTimezone: true }),
        customerSnapshot: jsonb("customer_snapshot"),
        issuedAt: timestamp("issued_at", { withTimezone: true }),
        issueChannel: varchar("issue_channel", { length: 80 }),
        issuedByUserId: uuid("issued_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        subtotal: money("subtotal"),
        total: money("total"),
        createdByUserId: uuid("created_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("quote_revisions_org_id_unique").on(table.organizationId, table.id),
        unique("quote_revisions_org_quote_id_unique").on(
            table.organizationId,
            table.quoteId,
            table.id,
        ),
        unique("quote_revisions_quote_number_unique").on(
            table.organizationId,
            table.quoteId,
            table.revisionNumber,
        ),
        unique("quote_revisions_org_id_scale_unique").on(
            table.organizationId,
            table.id,
            table.currencyScale,
        ),
        uniqueIndex("quote_revisions_one_draft_idx")
            .on(table.organizationId, table.quoteId)
            .where(sql`${table.status} = 'draft'`),
        uniqueIndex("quote_revisions_one_offer_idx")
            .on(table.organizationId, table.quoteId)
            .where(sql`${table.status} = 'offered'`),
        foreignKey({
            name: "quote_revisions_quote_fk",
            columns: [table.organizationId, table.quoteId],
            foreignColumns: [quotes.organizationId, quotes.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "quote_revisions_source_fk",
            columns: [table.organizationId, table.quoteId, table.sourceRevisionId],
            foreignColumns: [table.organizationId, table.quoteId, table.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "quote_revisions_superseded_by_fk",
            columns: [table.organizationId, table.quoteId, table.supersededByRevisionId],
            foreignColumns: [table.organizationId, table.quoteId, table.id],
        }).onDelete("restrict"),
        index("quote_revisions_org_quote_number_idx").on(
            table.organizationId,
            table.quoteId,
            table.revisionNumber.desc(),
        ),
        check("quote_revisions_number_positive", sql`${table.revisionNumber} > 0`),
        check("quote_revisions_version_positive", sql`${table.version} > 0`),
        check("quote_revisions_request_version_positive", sql`${table.sourceRequestVersion} > 0`),
        check("quote_revisions_currency_code", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
        check("quote_revisions_currency_scale", sql`${table.currencyScale} BETWEEN 0 AND 4`),
        check("quote_revisions_calculation_policy", sql`${table.calculationPolicyVersion} = 1`),
        check(
            "quote_revisions_customer_snapshot_object",
            sql`${table.customerSnapshot} IS NULL OR jsonb_typeof(${table.customerSnapshot}) = 'object'`,
        ),
        check(
            "quote_revisions_issued_metadata",
            sql`(${table.status} IN ('draft', 'discarded') AND ${table.issuedAt} IS NULL AND ${table.issueChannel} IS NULL AND ${table.issuedByUserId} IS NULL) OR (${table.status} NOT IN ('draft', 'discarded') AND ${table.issuedAt} IS NOT NULL AND ${table.issueChannel} IS NOT NULL AND ${table.issuedByUserId} IS NOT NULL AND ${table.customerSnapshot} IS NOT NULL AND ${table.subtotal} IS NOT NULL AND ${table.total} IS NOT NULL)`,
        ),
        check(
            "quote_revisions_supersession_state",
            sql`(${table.status} = 'superseded') = (${table.supersededByRevisionId} IS NOT NULL)`,
        ),
        check(
            "quote_revisions_totals_scale",
            sql`(${table.subtotal} IS NULL OR (${table.subtotal} = round(${table.subtotal}, ${table.currencyScale}) AND ${table.subtotal} >= 0 AND ${table.subtotal} < 1000000000000000000)) AND (${table.total} IS NULL OR (${table.total} = round(${table.total}, ${table.currencyScale}) AND ${table.total} >= 0 AND ${table.total} < 1000000000000000000))`,
        ),
    ],
);

export const quoteRevisionLines = pgTable(
    "quote_revision_lines",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        currencyScale: integer("currency_scale").notNull(),
        position: integer("position").notNull(),
        description: text("description").notNull(),
        quantity: decimalInput("quantity").notNull(),
        unit: varchar("unit", { length: 40 }).notNull(),
        unitPrice: decimalInput("unit_price").notNull(),
        roundedBaseAmount: money("rounded_base_amount"),
        totalAmount: money("total_amount"),
        partyId: uuid("party_id"),
        assetId: uuid("asset_id"),
        partySnapshot: jsonb("party_snapshot"),
        assetSnapshot: jsonb("asset_snapshot"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("quote_revision_lines_org_id_unique").on(table.organizationId, table.id),
        unique("quote_revision_lines_org_revision_id_unique").on(
            table.organizationId,
            table.revisionId,
            table.id,
        ),
        unique("quote_revision_lines_position_unique").on(
            table.organizationId,
            table.revisionId,
            table.position,
        ),
        foreignKey({
            name: "quote_revision_lines_revision_fk",
            columns: [table.organizationId, table.revisionId, table.currencyScale],
            foreignColumns: [
                quoteRevisions.organizationId,
                quoteRevisions.id,
                quoteRevisions.currencyScale,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "quote_revision_lines_party_fk",
            columns: [table.organizationId, table.partyId],
            foreignColumns: [parties.organizationId, parties.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "quote_revision_lines_asset_fk",
            columns: [table.organizationId, table.assetId],
            foreignColumns: [assets.organizationId, assets.id],
        }).onDelete("restrict"),
        check("quote_revision_lines_position_positive", sql`${table.position} > 0`),
        check(
            "quote_revision_lines_description_not_blank",
            sql`char_length(btrim(${table.description})) > 0`,
        ),
        check("quote_revision_lines_unit_not_blank", sql`char_length(btrim(${table.unit})) > 0`),
        check(
            "quote_revision_lines_quantity_precision",
            sql`${table.quantity} > 0 AND ${table.quantity} < 1000000000000 AND ${table.quantity} = round(${table.quantity}, 6)`,
        ),
        check(
            "quote_revision_lines_unit_price_precision",
            sql`${table.unitPrice} >= 0 AND ${table.unitPrice} < 1000000000000 AND ${table.unitPrice} = round(${table.unitPrice}, 6)`,
        ),
        check(
            "quote_revision_lines_amount_scale",
            sql`(${table.roundedBaseAmount} IS NULL OR (${table.roundedBaseAmount} = round(${table.roundedBaseAmount}, ${table.currencyScale}) AND ${table.roundedBaseAmount} >= 0 AND ${table.roundedBaseAmount} < 1000000000000000000)) AND (${table.totalAmount} IS NULL OR (${table.totalAmount} = round(${table.totalAmount}, ${table.currencyScale}) AND ${table.totalAmount} >= 0 AND ${table.totalAmount} < 1000000000000000000))`,
        ),
        check(
            "quote_revision_lines_snapshot_objects",
            sql`(${table.partySnapshot} IS NULL OR jsonb_typeof(${table.partySnapshot}) = 'object') AND (${table.assetSnapshot} IS NULL OR jsonb_typeof(${table.assetSnapshot}) = 'object')`,
        ),
    ],
);

export const quoteLineAdjustments = pgTable(
    "quote_line_adjustments",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        lineId: uuid("line_id").notNull(),
        currencyScale: integer("currency_scale").notNull(),
        position: integer("position").notNull(),
        label: varchar("label", { length: 120 }).notNull(),
        amount: money("amount").notNull(),
    },
    (table) => [
        unique("quote_line_adjustments_org_id_unique").on(table.organizationId, table.id),
        unique("quote_line_adjustments_position_unique").on(
            table.organizationId,
            table.lineId,
            table.position,
        ),
        foreignKey({
            name: "quote_line_adjustments_line_fk",
            columns: [table.organizationId, table.revisionId, table.lineId],
            foreignColumns: [
                quoteRevisionLines.organizationId,
                quoteRevisionLines.revisionId,
                quoteRevisionLines.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "quote_line_adjustments_revision_scale_fk",
            columns: [table.organizationId, table.revisionId, table.currencyScale],
            foreignColumns: [
                quoteRevisions.organizationId,
                quoteRevisions.id,
                quoteRevisions.currencyScale,
            ],
        }).onDelete("restrict"),
        check("quote_line_adjustments_position_positive", sql`${table.position} > 0`),
        check(
            "quote_line_adjustments_label_not_blank",
            sql`char_length(btrim(${table.label})) > 0`,
        ),
        check(
            "quote_line_adjustments_amount_scale",
            sql`${table.amount} = round(${table.amount}, ${table.currencyScale}) AND abs(${table.amount}) < 1000000000000000000`,
        ),
    ],
);

export const quoteRevisionAdjustments = pgTable(
    "quote_revision_adjustments",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        currencyScale: integer("currency_scale").notNull(),
        position: integer("position").notNull(),
        label: varchar("label", { length: 120 }).notNull(),
        amount: money("amount").notNull(),
    },
    (table) => [
        unique("quote_revision_adjustments_org_id_unique").on(table.organizationId, table.id),
        unique("quote_revision_adjustments_position_unique").on(
            table.organizationId,
            table.revisionId,
            table.position,
        ),
        foreignKey({
            name: "quote_revision_adjustments_revision_fk",
            columns: [table.organizationId, table.revisionId, table.currencyScale],
            foreignColumns: [
                quoteRevisions.organizationId,
                quoteRevisions.id,
                quoteRevisions.currencyScale,
            ],
        }).onDelete("restrict"),
        check("quote_revision_adjustments_position_positive", sql`${table.position} > 0`),
        check(
            "quote_revision_adjustments_label_not_blank",
            sql`char_length(btrim(${table.label})) > 0`,
        ),
        check(
            "quote_revision_adjustments_amount_scale",
            sql`${table.amount} = round(${table.amount}, ${table.currencyScale}) AND abs(${table.amount}) < 1000000000000000000`,
        ),
    ],
);

export type Quote = typeof quotes.$inferSelect;
export type QuoteRevision = typeof quoteRevisions.$inferSelect;
export type QuoteRevisionLine = typeof quoteRevisionLines.$inferSelect;

export const quoteAcceptances = pgTable(
    "quote_acceptances",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        quoteId: uuid("quote_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        idempotencyKey: uuid("idempotency_key").notNull(),
        payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
        agreementAt: timestamp("agreement_at", { withTimezone: true }),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
        recordedByUserId: uuid("recorded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        suppliedByName: varchar("supplied_by_name", { length: 120 }),
        suppliedByContactId: uuid("supplied_by_contact_id"),
        channel: varchar("channel", { length: 120 }).notNull(),
        externalReference: varchar("external_reference", { length: 120 }),
        withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
        withdrawnByUserId: uuid("withdrawn_by_user_id").references(() => users.id, {
            onDelete: "restrict",
        }),
        withdrawalReason: text("withdrawal_reason"),
    },
    (table) => [
        unique("quote_acceptances_org_id_unique").on(table.organizationId, table.id),
        unique("quote_acceptances_org_quote_id_unique").on(
            table.organizationId,
            table.quoteId,
            table.id,
        ),
        unique("quote_acceptances_idempotency_unique").on(
            table.organizationId,
            table.idempotencyKey,
        ),
        uniqueIndex("quote_acceptances_one_active_idx")
            .on(table.organizationId, table.quoteId)
            .where(sql`${table.withdrawnAt} IS NULL`),
        foreignKey({
            name: "quote_acceptances_revision_fk",
            columns: [table.organizationId, table.quoteId, table.revisionId],
            foreignColumns: [
                quoteRevisions.organizationId,
                quoteRevisions.quoteId,
                quoteRevisions.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "quote_acceptances_contact_fk",
            columns: [table.organizationId, table.suppliedByContactId],
            foreignColumns: [partyContacts.organizationId, partyContacts.id],
        }).onDelete("restrict"),
        check("quote_acceptances_hash", sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
        check("quote_acceptances_channel", sql`char_length(btrim(${table.channel})) > 0`),
        check(
            "quote_acceptances_withdrawal_complete",
            sql`(${table.withdrawnAt} IS NULL AND ${table.withdrawnByUserId} IS NULL AND ${table.withdrawalReason} IS NULL) OR (${table.withdrawnAt} IS NOT NULL AND ${table.withdrawnByUserId} IS NOT NULL AND char_length(btrim(${table.withdrawalReason})) > 0)`,
        ),
    ],
);

export const quoteHistoryEntries = pgTable(
    "quote_history_entries",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        quoteId: uuid("quote_id").notNull(),
        version: integer("version").notNull(),
        kind: varchar("kind", { length: 80 }).notNull(),
        revisionId: uuid("revision_id"),
        acceptanceId: uuid("acceptance_id"),
        reason: text("reason"),
        context: jsonb("context"),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
        recordedByUserId: uuid("recorded_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
    },
    (table) => [
        unique("quote_history_entries_org_quote_version_unique").on(
            table.organizationId,
            table.quoteId,
            table.version,
        ),
        foreignKey({
            name: "quote_history_entries_quote_fk",
            columns: [table.organizationId, table.quoteId],
            foreignColumns: [quotes.organizationId, quotes.id],
        }).onDelete("restrict"),
        foreignKey({
            name: "quote_history_entries_revision_fk",
            columns: [table.organizationId, table.quoteId, table.revisionId],
            foreignColumns: [
                quoteRevisions.organizationId,
                quoteRevisions.quoteId,
                quoteRevisions.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "quote_history_entries_acceptance_fk",
            columns: [table.organizationId, table.quoteId, table.acceptanceId],
            foreignColumns: [
                quoteAcceptances.organizationId,
                quoteAcceptances.quoteId,
                quoteAcceptances.id,
            ],
        }).onDelete("restrict"),
        check("quote_history_entries_version_positive", sql`${table.version} > 0`),
    ],
);
