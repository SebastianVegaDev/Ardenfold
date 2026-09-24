import type { User } from "@ardenfold/database/schema";

export type WorkosTokenClaims = Readonly<{
    issuer: string;
    subject: string;
    sessionId: string;
}>;

export type AuthenticatedPrincipal = Readonly<{
    user: User;
    sessionId: string;
    externalIdentity: Readonly<{
        provider: "workos";
        issuer: string;
        subject: string;
    }>;
}>;

declare module "fastify" {
    interface FastifyRequest {
        principal?: AuthenticatedPrincipal;
    }
}
