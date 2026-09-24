import { z } from "zod";

export const livenessResponseSchema = z.strictObject({
    status: z.literal("ok"),
    service: z.literal("api"),
});
export const readinessResponseSchema = livenessResponseSchema.extend({ database: z.literal("up") });

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
