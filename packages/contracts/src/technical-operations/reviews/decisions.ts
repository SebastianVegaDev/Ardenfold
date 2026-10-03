import { z } from "zod";

import { identifierSchema } from "../../shared/primitives";

const version = z.number().int().positive();
const decision = {
    idempotencyKey: identifierSchema,
    expectedExecutionVersion: version,
    expectedRevisionVersion: version,
    reason: z.string().trim().min(1).max(2000).nullable(),
    notes: z.string().trim().min(1).max(4000).nullable(),
};

export const decideTechnicalReviewSchema = z
    .strictObject({
        ...decision,
        outcome: z.enum(["accepted", "changes_requested", "rejected"]),
    })
    .superRefine((value, context) => {
        if (value.outcome !== "accepted" && value.reason === null)
            context.addIssue({ code: "custom", message: "Reason required for nonacceptance" });
    });
export type DecideTechnicalReview = z.infer<typeof decideTechnicalReviewSchema>;

export const decideTechnicalApprovalSchema = z
    .strictObject({
        ...decision,
        reviewId: identifierSchema,
        outcome: z.enum(["approved", "declined"]),
    })
    .superRefine((value, context) => {
        if (value.outcome === "declined" && value.reason === null)
            context.addIssue({ code: "custom", message: "Reason required for decline" });
    });
export type DecideTechnicalApproval = z.infer<typeof decideTechnicalApprovalSchema>;
