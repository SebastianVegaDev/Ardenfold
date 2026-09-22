import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import type { AuthenticatedPrincipal } from "./auth.types";

export const CurrentPrincipal = createParamDecorator(
    (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
        const principal = context.switchToHttp().getRequest<FastifyRequest>().principal;

        if (!principal) {
            throw new Error("Authenticated principal is missing after authorization.");
        }

        return principal;
    },
);
