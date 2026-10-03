import { z } from "zod";

import { identifierSchema, instantSchema } from "../shared/primitives";

export const supportedFileMediaTypeSchema = z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "text/plain",
]);

export const requestFileUploadSchema = z.strictObject({
    idempotencyKey: identifierSchema,
    filename: z.string().trim().min(1).max(240),
    mediaType: supportedFileMediaTypeSchema,
    byteLength: z.number().int().min(1).max(10_485_760),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});

export const storedObjectStatusSchema = z.enum(["pending", "uploaded", "finalized", "abandoned"]);

export const storedObjectSchema = z.strictObject({
    id: identifierSchema,
    filename: z.string(),
    mediaType: supportedFileMediaTypeSchema.nullable(),
    expectedByteLength: z.number().int().positive(),
    byteLength: z.number().int().positive().nullable(),
    sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/u)
        .nullable(),
    status: storedObjectStatusSchema,
    createdAt: instantSchema,
    finalizedAt: instantSchema.nullable(),
});

export type RequestFileUpload = z.infer<typeof requestFileUploadSchema>;
export type StoredObject = z.infer<typeof storedObjectSchema>;
