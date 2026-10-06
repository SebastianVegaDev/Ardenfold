import { technicalQueueQuerySchema, type TechnicalQueueQuery } from "@ardenfold/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentPrincipal } from "../../auth/authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { RequirePermissions } from "../../auth/authorization/require-permissions.decorator";
import { CurrentOrganization } from "../../auth/organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../../auth/organization-context/organization-context.types";
import { ContractValidationPipe } from "../../http/contracts";
import { TechnicalQueuesService } from "../queries/technical-queues.service";

@ApiTags("technical-operations-queries")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("technical-operations/queues")
export class TechnicalQueuesController {
    constructor(private readonly queues: TechnicalQueuesService) {}

    @Get()
    @RequirePermissions(
        "technical_executions.read",
        "work_orders.read",
        "parties.read",
        "assets.read",
    )
    @ApiOperation({ operationId: "listTechnicalOperationsQueue" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/TechnicalQueueResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(technicalQueueQuerySchema)) query: TechnicalQueueQuery,
    ) {
        return this.queues.list(principal, org.id, query);
    }
}
