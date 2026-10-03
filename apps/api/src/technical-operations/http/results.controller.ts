import {
    createTechnicalResultGroupSchema,
    createTechnicalResultSchema,
    identifierSchema,
    removeTechnicalResultGroupSchema,
    removeTechnicalResultSchema,
    reorderTechnicalResultGroupsSchema,
    reorderTechnicalResultsSchema,
    updateTechnicalResultGroupSchema,
    updateTechnicalResultSchema,
    type CreateTechnicalResult,
    type CreateTechnicalResultGroup,
    type RemoveTechnicalResult,
    type RemoveTechnicalResultGroup,
    type ReorderTechnicalResultGroups,
    type ReorderTechnicalResults,
    type UpdateTechnicalResult,
    type UpdateTechnicalResultGroup,
} from "@ardenfold/contracts";
import { Body, Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentPrincipal } from "../../auth/authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { RequirePermissions } from "../../auth/authorization/require-permissions.decorator";
import { CurrentOrganization } from "../../auth/organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../../auth/organization-context/organization-context.types";
import { ContractValidationPipe } from "../../http/contracts";
import { TechnicalResultsService } from "../results/management/technical-results.service";

@ApiTags("technical-operations-results")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("technical-executions/:executionId/revisions/:revisionId")
export class TechnicalResultsController {
    constructor(private readonly results: TechnicalResultsService) {}

    @Get("results")
    @RequirePermissions("technical_executions.read")
    @ApiOperation({ operationId: "listTechnicalResults" })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
    ) {
        return this.results.list(principal, org.id, executionId, revisionId);
    }

    @Post("results")
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "createTechnicalResult" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreateTechnicalResult" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(createTechnicalResultSchema)) input: CreateTechnicalResult,
    ) {
        return this.results.create(principal, org.id, executionId, revisionId, input);
    }

    @Post("results/reorder")
    @HttpCode(200)
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "reorderTechnicalResults" })
    @ApiBody({ schema: { $ref: "#/components/schemas/ReorderTechnicalResults" } })
    reorder(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(reorderTechnicalResultsSchema))
        input: ReorderTechnicalResults,
    ) {
        return this.results.reorder(principal, org.id, executionId, revisionId, input);
    }

    @Patch("results/:resultId")
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "updateTechnicalResult" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdateTechnicalResult" } })
    update(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Param("resultId", new ContractValidationPipe(identifierSchema)) resultId: string,
        @Body(new ContractValidationPipe(updateTechnicalResultSchema)) input: UpdateTechnicalResult,
    ) {
        return this.results.update(principal, org.id, executionId, revisionId, resultId, input);
    }

    @Post("results/:resultId/remove")
    @HttpCode(200)
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "removeTechnicalResult" })
    @ApiBody({ schema: { $ref: "#/components/schemas/RemoveTechnicalResult" } })
    remove(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Param("resultId", new ContractValidationPipe(identifierSchema)) resultId: string,
        @Body(new ContractValidationPipe(removeTechnicalResultSchema)) input: RemoveTechnicalResult,
    ) {
        return this.results.remove(principal, org.id, executionId, revisionId, resultId, input);
    }

    @Post("result-groups")
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "createTechnicalResultGroup" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreateTechnicalResultGroup" } })
    createGroup(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(createTechnicalResultGroupSchema))
        input: CreateTechnicalResultGroup,
    ) {
        return this.results.createGroup(principal, org.id, executionId, revisionId, input);
    }

    @Post("result-groups/reorder")
    @HttpCode(200)
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "reorderTechnicalResultGroups" })
    @ApiBody({ schema: { $ref: "#/components/schemas/ReorderTechnicalResultGroups" } })
    reorderGroups(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(reorderTechnicalResultGroupsSchema))
        input: ReorderTechnicalResultGroups,
    ) {
        return this.results.reorderGroups(principal, org.id, executionId, revisionId, input);
    }

    @Patch("result-groups/:groupId")
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "updateTechnicalResultGroup" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdateTechnicalResultGroup" } })
    updateGroup(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Param("groupId", new ContractValidationPipe(identifierSchema)) groupId: string,
        @Body(new ContractValidationPipe(updateTechnicalResultGroupSchema))
        input: UpdateTechnicalResultGroup,
    ) {
        return this.results.updateGroup(principal, org.id, executionId, revisionId, groupId, input);
    }

    @Post("result-groups/:groupId/remove")
    @HttpCode(200)
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "removeTechnicalResultGroup" })
    @ApiBody({ schema: { $ref: "#/components/schemas/RemoveTechnicalResultGroup" } })
    removeGroup(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Param("groupId", new ContractValidationPipe(identifierSchema)) groupId: string,
        @Body(new ContractValidationPipe(removeTechnicalResultGroupSchema))
        input: RemoveTechnicalResultGroup,
    ) {
        return this.results.removeGroup(principal, org.id, executionId, revisionId, groupId, input);
    }
}
