import {
    auditEventQuerySchema,
    type AuditEventListResponse,
    type AuditEventQuery,
} from "@ardenfold/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentPrincipal } from "../auth/authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/authentication/types";
import { RequirePermissions } from "../auth/authorization/require-permissions.decorator";
import { CurrentOrganization } from "../auth/organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../auth/organization-context/organization-context.types";
import { ContractValidationPipe } from "../http/contracts";
import { AuditService } from "./audit.service";

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit-events")
export class AuditController {
    constructor(private readonly audit: AuditService) {}

    @Get()
    @RequirePermissions("audit.read")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "listAuditEvents" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AuditEventListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(auditEventQuerySchema)) query: AuditEventQuery,
    ): Promise<AuditEventListResponse> {
        return this.audit.list(principal, organization.id, query);
    }
}
