import {
    technicalRevisionSearchQuerySchema,
    type TechnicalRevisionSearchQuery,
} from "@ardenfold/contracts";
import { Controller, Get, Query } from "@nestjs/common";
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
import { TechnicalRevisionSearchService } from "../queries/technical-revision-search.service";

@ApiTags("technical-operations-queries")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("technical-revisions")
export class TechnicalRevisionsController {
    constructor(private readonly revisions: TechnicalRevisionSearchService) {}

    @Get()
    @RequirePermissions(
        "technical_executions.read",
        "work_orders.read",
        "parties.read",
        "assets.read",
    )
    @ApiOperation({ operationId: "searchTechnicalRevisions" })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(technicalRevisionSearchQuerySchema))
        query: TechnicalRevisionSearchQuery,
    ) {
        return this.revisions.list(principal, org.id, query);
    }
}
