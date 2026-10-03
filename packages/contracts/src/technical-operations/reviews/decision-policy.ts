import { z } from "zod";

export const technicalDecisionPolicySchema = z.strictObject({
    requirePerformerReviewerSeparation: z.boolean(),
    requireReviewerApproverSeparation: z.boolean(),
});
export type TechnicalDecisionPolicy = z.infer<typeof technicalDecisionPolicySchema>;
