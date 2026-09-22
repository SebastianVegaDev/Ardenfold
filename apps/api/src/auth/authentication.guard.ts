import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { IdentityService } from "./identity.service";
import { PUBLIC_ROUTE } from "./public.decorator";
import { WorkosTokenVerifier } from "./workos-token-verifier";

const MAX_BEARER_TOKEN_LENGTH = 8_192;

@Injectable()
export class AuthenticationGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly tokens: WorkosTokenVerifier,
        private readonly identities: IdentityService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (
            this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
                context.getHandler(),
                context.getClass(),
            ])
        ) {
            return true;
        }

        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const authorization = request.headers.authorization;
        const match = authorization?.match(/^Bearer ([^\s]+)$/u);

        if (!match?.[1] || match[1].length > MAX_BEARER_TOKEN_LENGTH) {
            throw new UnauthorizedException();
        }

        let claims;

        try {
            claims = await this.tokens.verify(match[1]);
        } catch {
            throw new UnauthorizedException();
        }

        // Persistence or upstream profile failures are operational failures,
        // not bad credentials. Let the global error boundary surface them as
        // 5xx so clients do not incorrectly discard a valid session.
        const user = await this.identities.resolve(claims);

        request.principal = {
            user,
            sessionId: claims.sessionId,
            externalIdentity: {
                provider: "workos",
                issuer: claims.issuer,
                subject: claims.subject,
            },
        };

        return true;
    }
}
