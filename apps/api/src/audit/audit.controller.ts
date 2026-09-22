import {
    auditEventQuerySchema,
    type AuditEventListResponse,
    type AuditEventQuery,
} from "@ardenfold/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentOrganization } from "../auth/current-organization.decorator";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { organizationHeader, type ActiveOrganizationContext } from "../auth/organization-context.types";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { RequirePermissions } from "../auth/require-permissions.decorator";
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
