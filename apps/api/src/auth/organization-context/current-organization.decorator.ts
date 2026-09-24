import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import type { ActiveOrganizationContext } from "./organization-context.types";

export const CurrentOrganization = createParamDecorator(
    (_data: unknown, context: ExecutionContext): ActiveOrganizationContext => {
        const organization = context
            .switchToHttp()
            .getRequest<FastifyRequest>().organizationContext;

        if (!organization) {
            throw new Error("Active organization is missing after authorization.");
        }

        return organization;
    },
);
