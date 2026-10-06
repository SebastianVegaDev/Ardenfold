import {
    identifierSchema,
    technicalHistoryQuerySchema,
    type TechnicalHistoryQuery,
} from "@ardenfold/contracts";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentPrincipal } from "../../auth/authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { RequirePermissions } from "../../auth/authorization/require-permissions.decorator";
import { CurrentOrganization } from "../../auth/organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../../auth/organization-context/organization-context.types";
import { ContractValidationPipe } from "../../http/contracts";
import { TechnicalHistoryService } from "../queries/technical-history.service";

@ApiTags("technical-operations-queries")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("technical-executions/:executionId/history")
export class TechnicalHistoryController {
    constructor(private readonly history: TechnicalHistoryService) {}

    @Get()
    @RequirePermissions(
        "technical_executions.read",
        "technical_evidence.read",
        "work_orders.read",
        "parties.read",
        "assets.read",
    )
    @ApiOperation({ operationId: "getTechnicalExecutionHistory" })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Query(new ContractValidationPipe(technicalHistoryQuerySchema))
        query: TechnicalHistoryQuery,
    ) {
        return this.history.get(principal, org.id, executionId, query);
    }
}
