import { z } from "zod";

export const registryImportKindSchema = z.enum(["party", "asset"]);
export const registryImportStatusSchema = z.enum(["previewed", "committing", "completed"]);
export const registryImportRowStatusSchema = z.enum([
    "valid",
    "rejected",
    "committed",
    "failed",
    "skipped",
]);

export const previewRegistryImportRequestSchema = z.strictObject({
    sessionId: z.uuid(),
    kind: registryImportKindSchema,
    csv: z.string().min(1).max(524_288),
});

export const commitRegistryImportRequestSchema = z.strictObject({
    approvedRows: z
        .array(z.number().int().min(2).max(501))
        .max(500)
        .refine((rows) => new Set(rows).size === rows.length),
});

export const registryImportIssueSchema = z.strictObject({
    code: z.string().min(1).max(64),
    field: z.string().max(64).nullable(),
});

export const registryImportCandidateSchema = z.strictObject({
    id: z.uuid(),
    displayName: z.string().min(1),
    matchedType: z.string().min(1),
});

export const registryImportRowSchema = z.strictObject({
    rowNumber: z.number().int().min(2),
    displayName: z.string().nullable(),
    status: registryImportRowStatusSchema,
    errors: z.array(registryImportIssueSchema),
    warnings: z.array(registryImportIssueSchema),
    duplicateCandidates: z.array(registryImportCandidateSchema),
    resourceId: z.uuid().nullable(),
});

export const registryImportSessionResponseSchema = z.strictObject({
    id: z.uuid(),
    kind: registryImportKindSchema,
    status: registryImportStatusSchema,
    templateVersion: z.literal(1),
    totalRows: z.number().int().min(0).max(500),
    approvedRows: z.array(z.number().int()).nullable(),
    summary: z.strictObject({
        valid: z.number().int().min(0),
        rejected: z.number().int().min(0),
        committed: z.number().int().min(0),
        failed: z.number().int().min(0),
        skipped: z.number().int().min(0),
    }),
    rows: z.array(registryImportRowSchema),
});

export type PreviewRegistryImportRequest = z.infer<typeof previewRegistryImportRequestSchema>;
export type CommitRegistryImportRequest = z.infer<typeof commitRegistryImportRequestSchema>;
export type RegistryImportIssue = z.infer<typeof registryImportIssueSchema>;
export type RegistryImportCandidate = z.infer<typeof registryImportCandidateSchema>;
export type RegistryImportSessionResponse = z.infer<typeof registryImportSessionResponseSchema>;
