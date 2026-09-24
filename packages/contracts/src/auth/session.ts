import { z } from "zod";

import { identifierSchema } from "../shared/primitives";

export const authenticatedUserResponseSchema = z.strictObject({
    user: z.strictObject({
        id: identifierSchema,
        email: z.email(),
        displayName: z.string().min(1).nullable(),
    }),
    session: z.strictObject({ id: z.string().min(1) }),
});

export type AuthenticatedUserResponse = z.infer<typeof authenticatedUserResponseSchema>;
