import { sql } from "drizzle-orm";
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
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "../identity";
import { executionRevisions } from "./executions";

export const technicalResultKind = pgEnum("technical_result_kind", [
    "quantitative",
    "categorical",
    "textual",
    "missing",
]);
export const technicalMissingReason = pgEnum("technical_missing_reason", [
    "not_observed",
    "not_applicable",
    "unavailable",
]);
export const technicalConformity = pgEnum("technical_conformity", [
    "conforms",
    "does_not_conform",
    "undetermined",
]);

export const technicalResultGroups = pgTable(
    "technical_result_groups",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        executionId: uuid("execution_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        position: integer("position").notNull(),
        label: varchar("label", { length: 200 }).notNull(),
        version: integer("version").default(1).notNull(),
        createdByUserId: uuid("created_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedByUserId: uuid("updated_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("technical_result_groups_org_execution_revision_id_unique").on(
            table.organizationId,
            table.executionId,
            table.revisionId,
            table.id,
        ),
        unique("technical_result_groups_org_revision_position_unique").on(
            table.organizationId,
            table.revisionId,
            table.position,
        ),
        foreignKey({
            name: "technical_result_groups_revision_fk",
            columns: [table.organizationId, table.executionId, table.revisionId],
            foreignColumns: [
                executionRevisions.organizationId,
                executionRevisions.executionId,
                executionRevisions.id,
            ],
        }).onDelete("restrict"),
        check("technical_result_groups_position_positive", sql`${table.position} > 0`),
        check("technical_result_groups_version_positive", sql`${table.version} > 0`),
        check(
            "technical_result_groups_label_not_blank",
            sql`char_length(btrim(${table.label})) > 0`,
        ),
    ],
);

export const technicalResults = pgTable(
    "technical_results",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organizationId: uuid("organization_id").notNull(),
        executionId: uuid("execution_id").notNull(),
        revisionId: uuid("revision_id").notNull(),
        groupId: uuid("group_id"),
        position: integer("position").notNull(),
        characteristic: varchar("characteristic", { length: 200 }).notNull(),
        contextNote: varchar("context_note", { length: 500 }),
        kind: technicalResultKind("kind").notNull(),
        decimalValueText: varchar("decimal_value_text", { length: 80 }),
        unitCode: varchar("unit_code", { length: 40 }),
        resolutionText: varchar("resolution_text", { length: 80 }),
        significantDigits: integer("significant_digits"),
        uncertaintyText: varchar("uncertainty_text", { length: 80 }),
        uncertaintyUnitCode: varchar("uncertainty_unit_code", { length: 40 }),
        uncertaintyCoverage: varchar("uncertainty_coverage", { length: 200 }),
        toleranceLowerText: varchar("tolerance_lower_text", { length: 80 }),
        toleranceUpperText: varchar("tolerance_upper_text", { length: 80 }),
        toleranceUnitCode: varchar("tolerance_unit_code", { length: 40 }),
        toleranceRule: varchar("tolerance_rule", { length: 500 }),
        categoryCode: varchar("category_code", { length: 80 }),
        categoryLabel: varchar("category_label", { length: 200 }),
        categoryMeaningSnapshot: varchar("category_meaning_snapshot", { length: 500 }),
        textValue: text("text_value"),
        textLanguage: varchar("text_language", { length: 35 }),
        missingReason: technicalMissingReason("missing_reason"),
        missingExplanation: varchar("missing_explanation", { length: 500 }),
        conformity: technicalConformity("conformity"),
        conformityRule: varchar("conformity_rule", { length: 500 }),
        version: integer("version").default(1).notNull(),
        createdByUserId: uuid("created_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedByUserId: uuid("updated_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique("technical_results_org_execution_revision_id_unique").on(
            table.organizationId,
            table.executionId,
            table.revisionId,
            table.id,
        ),
        uniqueIndex("technical_results_group_position_unique")
            .on(table.organizationId, table.revisionId, table.groupId, table.position)
            .where(sql`${table.groupId} IS NOT NULL`),
        uniqueIndex("technical_results_ungrouped_position_unique")
            .on(table.organizationId, table.revisionId, table.position)
            .where(sql`${table.groupId} IS NULL`),
        foreignKey({
            name: "technical_results_revision_fk",
            columns: [table.organizationId, table.executionId, table.revisionId],
            foreignColumns: [
                executionRevisions.organizationId,
                executionRevisions.executionId,
                executionRevisions.id,
            ],
        }).onDelete("restrict"),
        foreignKey({
            name: "technical_results_group_fk",
            columns: [table.organizationId, table.executionId, table.revisionId, table.groupId],
            foreignColumns: [
                technicalResultGroups.organizationId,
                technicalResultGroups.executionId,
                technicalResultGroups.revisionId,
                technicalResultGroups.id,
            ],
        }).onDelete("restrict"),
        index("technical_results_org_revision_order_idx").on(
            table.organizationId,
            table.revisionId,
            table.position,
            table.id,
        ),
        check("technical_results_position_positive", sql`${table.position} > 0`),
        check("technical_results_version_positive", sql`${table.version} > 0`),
        check(
            "technical_results_characteristic_not_blank",
            sql`char_length(btrim(${table.characteristic})) > 0`,
        ),
        check(
            "technical_results_context_bounded",
            sql`${table.contextNote} IS NULL OR char_length(${table.contextNote}) <= 500`,
        ),
        check(
            "technical_results_decimal_syntax",
            sql`(${table.decimalValueText} IS NULL OR ${table.decimalValueText} ~ '^-?[0-9]{1,16}([.][0-9]{1,12})?$') AND (${table.resolutionText} IS NULL OR ${table.resolutionText} ~ '^[0-9]{1,16}([.][0-9]{1,12})?$') AND (${table.uncertaintyText} IS NULL OR ${table.uncertaintyText} ~ '^[0-9]{1,16}([.][0-9]{1,12})?$') AND (${table.toleranceLowerText} IS NULL OR ${table.toleranceLowerText} ~ '^-?[0-9]{1,16}([.][0-9]{1,12})?$') AND (${table.toleranceUpperText} IS NULL OR ${table.toleranceUpperText} ~ '^-?[0-9]{1,16}([.][0-9]{1,12})?$')`,
        ),
        check(
            "technical_results_quantitative_fields",
            sql`(${table.kind} = 'quantitative' AND ${table.decimalValueText} IS NOT NULL AND ${table.unitCode} IS NOT NULL AND ${table.categoryCode} IS NULL AND ${table.categoryLabel} IS NULL AND ${table.categoryMeaningSnapshot} IS NULL AND ${table.textValue} IS NULL AND ${table.textLanguage} IS NULL AND ${table.missingReason} IS NULL AND ${table.missingExplanation} IS NULL) OR (${table.kind} <> 'quantitative' AND ${table.decimalValueText} IS NULL AND ${table.unitCode} IS NULL AND ${table.resolutionText} IS NULL AND ${table.significantDigits} IS NULL AND ${table.uncertaintyText} IS NULL AND ${table.uncertaintyUnitCode} IS NULL AND ${table.uncertaintyCoverage} IS NULL AND ${table.toleranceLowerText} IS NULL AND ${table.toleranceUpperText} IS NULL AND ${table.toleranceUnitCode} IS NULL AND ${table.toleranceRule} IS NULL)`,
        ),
        check(
            "technical_results_nonquantitative_fields",
            sql`(${table.kind} = 'categorical' AND ${table.categoryCode} IS NOT NULL AND ${table.categoryLabel} IS NOT NULL AND ${table.categoryMeaningSnapshot} IS NOT NULL AND ${table.textValue} IS NULL AND ${table.textLanguage} IS NULL AND ${table.missingReason} IS NULL AND ${table.missingExplanation} IS NULL) OR (${table.kind} = 'textual' AND ${table.categoryCode} IS NULL AND ${table.categoryLabel} IS NULL AND ${table.categoryMeaningSnapshot} IS NULL AND ${table.textValue} IS NOT NULL AND ${table.missingReason} IS NULL AND ${table.missingExplanation} IS NULL) OR (${table.kind} = 'missing' AND ${table.categoryCode} IS NULL AND ${table.categoryLabel} IS NULL AND ${table.categoryMeaningSnapshot} IS NULL AND ${table.textValue} IS NULL AND ${table.textLanguage} IS NULL AND ${table.missingReason} IS NOT NULL AND ${table.conformity} IS NULL AND ${table.conformityRule} IS NULL) OR ${table.kind} = 'quantitative'`,
        ),
        check(
            "technical_results_quantitative_context",
            sql`${table.kind} <> 'quantitative' OR (${table.unitCode} ~ '^[A-Za-z0-9][A-Za-z0-9./*^%_-]{0,39}$' AND (${table.resolutionText} IS NULL OR ${table.resolutionText}::numeric > 0) AND (${table.significantDigits} IS NULL OR ${table.significantDigits} BETWEEN 1 AND 28) AND (${table.uncertaintyText} IS NULL OR (${table.uncertaintyText}::numeric >= 0 AND ${table.uncertaintyUnitCode} IS NOT NULL AND ${table.uncertaintyCoverage} IS NOT NULL)) AND (${table.uncertaintyText} IS NOT NULL OR (${table.uncertaintyUnitCode} IS NULL AND ${table.uncertaintyCoverage} IS NULL)) AND (${table.toleranceLowerText} IS NOT NULL OR ${table.toleranceUpperText} IS NOT NULL OR (${table.toleranceUnitCode} IS NULL AND ${table.toleranceRule} IS NULL)) AND ((${table.toleranceLowerText} IS NULL AND ${table.toleranceUpperText} IS NULL) OR (${table.toleranceUnitCode} IS NOT NULL AND ${table.toleranceRule} IS NOT NULL)))`,
        ),
        check(
            "technical_results_conformity_rule",
            sql`(${table.conformity} IS NULL AND ${table.conformityRule} IS NULL) OR (${table.conformity} IS NOT NULL AND ${table.conformityRule} IS NOT NULL AND char_length(btrim(${table.conformityRule})) > 0)`,
        ),
        check(
            "technical_results_text_bounds",
            sql`(${table.textValue} IS NULL OR char_length(${table.textValue}) BETWEEN 1 AND 4000) AND (${table.missingExplanation} IS NULL OR char_length(btrim(${table.missingExplanation})) > 0) AND (${table.categoryCode} IS NULL OR char_length(btrim(${table.categoryCode})) > 0) AND (${table.categoryLabel} IS NULL OR char_length(btrim(${table.categoryLabel})) > 0) AND (${table.categoryMeaningSnapshot} IS NULL OR char_length(btrim(${table.categoryMeaningSnapshot})) > 0)`,
        ),
        check(
            "technical_results_auxiliary_units",
            sql`(${table.uncertaintyUnitCode} IS NULL OR ${table.uncertaintyUnitCode} ~ '^[A-Za-z0-9][A-Za-z0-9./*^%_-]{0,39}$') AND (${table.toleranceUnitCode} IS NULL OR ${table.toleranceUnitCode} ~ '^[A-Za-z0-9][A-Za-z0-9./*^%_-]{0,39}$') AND (${table.uncertaintyCoverage} IS NULL OR char_length(btrim(${table.uncertaintyCoverage})) > 0) AND (${table.toleranceRule} IS NULL OR char_length(btrim(${table.toleranceRule})) > 0)`,
        ),
        check(
            "technical_results_tolerance_order",
            sql`${table.toleranceLowerText} IS NULL OR ${table.toleranceUpperText} IS NULL OR ${table.toleranceLowerText}::numeric <= ${table.toleranceUpperText}::numeric`,
        ),
        check(
            "technical_results_text_not_blank",
            sql`${table.textValue} IS NULL OR char_length(btrim(${table.textValue})) > 0`,
        ),
    ],
);
