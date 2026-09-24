import { z } from "zod";

export const validationIssueSchema = z.strictObject({
    source: z.enum(["body", "query", "params"]),
    path: z.string(),
    code: z.enum([
        "INVALID_TYPE",
        "INVALID_FORMAT",
        "OUT_OF_RANGE",
        "UNKNOWN_FIELD",
        "INVALID_VALUE",
    ]),
});

export const apiErrorSchema = z.strictObject({
    error: z.strictObject({
        code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
        status: z.number().int().min(400).max(599),
        traceId: z.uuid(),
        issues: z.array(validationIssueSchema),
        metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    }),
});

export const paginationQuerySchema = z.strictObject({
    page: z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
        .pipe(z.number().int().max(1_000_000))
        .default(1),
    limit: z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
        .pipe(z.number().int().max(100))
        .default(25),
});

export const pageInfoSchema = z.strictObject({
    page: z.number().int().min(1).max(1_000_000),
    limit: z.number().int().min(1).max(100),
    hasNextPage: z.boolean(),
});

export function pageSchema<T extends z.ZodType>(item: T) {
    return z.strictObject({ data: z.array(item), pageInfo: pageInfoSchema });
}

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
