import type { PermissionCode } from "@ardenfold/contracts";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { ContractException } from "../http/contracts";
import { OrganizationAuthorizationService } from "./organization-authorization.service";
import { organizationHeader } from "./organization-context.types";
import { REQUIRED_PERMISSIONS } from "./require-permissions.decorator";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class OrganizationAuthorizationGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authorization: OrganizationAuthorizationService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const permissions = this.reflector.getAllAndOverride<readonly PermissionCode[]>(
            REQUIRED_PERMISSIONS,
            [context.getHandler(), context.getClass()],
        );

        if (!permissions) {
            return true;
        }

        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const organizationId = request.headers[organizationHeader];

        if (typeof organizationId !== "string" || !UUID_PATTERN.test(organizationId)) {
            throw new ContractException("ORGANIZATION_CONTEXT_REQUIRED", 400);
        }

        if (!request.principal) {
            throw new Error(
                "Authenticated principal is missing before organization authorization.",
            );
        }

        request.organizationContext = await this.authorization.authorize(
            request.principal.user.id,
            organizationId,
            permissions,
        );

        return true;
    }
}
