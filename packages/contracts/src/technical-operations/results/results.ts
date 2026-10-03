import { z } from "zod";

import { identifierSchema } from "../../shared/primitives";

const id = identifierSchema;
const version = z.number().int().positive();
const decimal = z.string().regex(/^-?[0-9]{1,16}(?:\.[0-9]{1,12})?$/);
const nonnegativeDecimal = z.string().regex(/^[0-9]{1,16}(?:\.[0-9]{1,12})?$/);
const unitCode = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9./*^%_-]{0,39}$/);
const common = {
    groupId: id.nullable(),
    position: version,
    characteristic: z.string().trim().min(1).max(200),
    contextNote: z.string().trim().min(1).max(500).nullable(),
};
const conformity = {
    conformity: z.enum(["conforms", "does_not_conform", "undetermined"]).nullable(),
    conformityRule: z.string().trim().min(1).max(500).nullable(),
};

export const technicalResultValueSchema = z.discriminatedUnion("kind", [
    z
        .strictObject({
            ...common,
            ...conformity,
            kind: z.literal("quantitative"),
            decimalValueText: decimal,
            unitCode,
            resolutionText: nonnegativeDecimal.nullable(),
            significantDigits: z.number().int().min(1).max(28).nullable(),
            uncertaintyText: nonnegativeDecimal.nullable(),
            uncertaintyUnitCode: unitCode.nullable(),
            uncertaintyCoverage: z.string().trim().min(1).max(200).nullable(),
            toleranceLowerText: decimal.nullable(),
            toleranceUpperText: decimal.nullable(),
            toleranceUnitCode: unitCode.nullable(),
            toleranceRule: z.string().trim().min(1).max(500).nullable(),
        })
        .superRefine((value, context) => {
            if (
                value.uncertaintyText === null
                    ? value.uncertaintyUnitCode !== null || value.uncertaintyCoverage !== null
                    : value.uncertaintyUnitCode === null || value.uncertaintyCoverage === null
            )
                context.addIssue({
                    code: "custom",
                    message: "Uncertainty requires unit and coverage",
                });
            if (
                value.toleranceLowerText === null && value.toleranceUpperText === null
                    ? value.toleranceUnitCode !== null || value.toleranceRule !== null
                    : value.toleranceUnitCode === null || value.toleranceRule === null
            )
                context.addIssue({ code: "custom", message: "Tolerance requires unit and rule" });
        }),
    z.strictObject({
        ...common,
        ...conformity,
        kind: z.literal("categorical"),
        categoryCode: z.string().trim().min(1).max(80),
        categoryLabel: z.string().trim().min(1).max(200),
        categoryMeaningSnapshot: z.string().trim().min(1).max(500),
    }),
    z.strictObject({
        ...common,
        ...conformity,
        kind: z.literal("textual"),
        textValue: z.string().trim().min(1).max(4000),
        textLanguage: z.string().trim().min(1).max(35).nullable(),
    }),
    z.strictObject({
        ...common,
        kind: z.literal("missing"),
        missingReason: z.enum(["not_observed", "not_applicable", "unavailable"]),
        missingExplanation: z.string().trim().min(1).max(500).nullable(),
    }),
]);
export type TechnicalResultValue = z.infer<typeof technicalResultValueSchema>;

export const createTechnicalResultSchema = z.strictObject({
    expectedRevisionVersion: version,
    value: technicalResultValueSchema,
});
export type CreateTechnicalResult = z.infer<typeof createTechnicalResultSchema>;

export const updateTechnicalResultSchema = z.strictObject({
    expectedRevisionVersion: version,
    expectedResultVersion: version,
    value: technicalResultValueSchema,
});
export type UpdateTechnicalResult = z.infer<typeof updateTechnicalResultSchema>;

export const removeTechnicalResultSchema = z.strictObject({
    expectedRevisionVersion: version,
    expectedResultVersion: version,
});
export type RemoveTechnicalResult = z.infer<typeof removeTechnicalResultSchema>;

export const createTechnicalResultGroupSchema = z.strictObject({
    expectedRevisionVersion: version,
    position: version,
    label: z.string().trim().min(1).max(200),
});
export type CreateTechnicalResultGroup = z.infer<typeof createTechnicalResultGroupSchema>;

export const updateTechnicalResultGroupSchema = z.strictObject({
    expectedRevisionVersion: version,
    expectedGroupVersion: version,
    position: version,
    label: z.string().trim().min(1).max(200),
});
export type UpdateTechnicalResultGroup = z.infer<typeof updateTechnicalResultGroupSchema>;

export const removeTechnicalResultGroupSchema = z.strictObject({
    expectedRevisionVersion: version,
    expectedGroupVersion: version,
});
export type RemoveTechnicalResultGroup = z.infer<typeof removeTechnicalResultGroupSchema>;

export const reorderTechnicalResultsSchema = z.strictObject({
    expectedRevisionVersion: version,
    groupId: id.nullable(),
    orderedIds: z.array(id).min(1).max(500),
});
export type ReorderTechnicalResults = z.infer<typeof reorderTechnicalResultsSchema>;

export const reorderTechnicalResultGroupsSchema = z.strictObject({
    expectedRevisionVersion: version,
    orderedIds: z.array(id).min(1).max(100),
});
export type ReorderTechnicalResultGroups = z.infer<typeof reorderTechnicalResultGroupsSchema>;
