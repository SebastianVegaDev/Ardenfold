import { z } from "zod";

import { identifierSchema } from "../../shared/primitives";

const id = identifierSchema;
const version = z.number().int().positive();
const common = {
    expectedRevisionVersion: version,
    target: z.enum(["revision", "result"]),
    resultId: id.nullable(),
    evidenceType: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
    description: z.string().trim().min(1).max(2000),
};

export const createTechnicalEvidenceSchema = z
    .discriminatedUnion("kind", [
        z.strictObject({ ...common, kind: z.literal("file"), storedObjectId: id }),
        z.strictObject({
            ...common,
            kind: z.literal("observation"),
            observationText: z.string().trim().min(1).max(4000),
        }),
    ])
    .superRefine((value, context) => {
        if ((value.target === "revision") !== (value.resultId === null))
            context.addIssue({ code: "custom", message: "Evidence target and result must agree" });
    });
export type CreateTechnicalEvidence = z.infer<typeof createTechnicalEvidenceSchema>;

export const updateTechnicalEvidenceSchema = z.strictObject({
    expectedRevisionVersion: version,
    expectedEvidenceVersion: version,
    description: z.string().trim().min(1).max(2000),
    evidenceType: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
    observationText: z.string().trim().min(1).max(4000).optional(),
});
export type UpdateTechnicalEvidence = z.infer<typeof updateTechnicalEvidenceSchema>;

export const removeTechnicalEvidenceSchema = z.strictObject({
    expectedRevisionVersion: version,
    expectedEvidenceVersion: version,
});
export type RemoveTechnicalEvidence = z.infer<typeof removeTechnicalEvidenceSchema>;
