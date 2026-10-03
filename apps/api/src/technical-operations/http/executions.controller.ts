import {
    abandonTechnicalExecutionSchema,
    createSuccessorRevisionSchema,
    discardExecutionDraftSchema,
    editExecutionDraftSchema,
    identifierSchema,
    startTechnicalExecutionSchema,
    submitExecutionRevisionSchema,
    technicalExecutionListQuerySchema,
    type AbandonTechnicalExecution,
    type CreateSuccessorRevision,
    type DiscardExecutionDraft,
    type EditExecutionDraft,
    type StartTechnicalExecution,
    type SubmitExecutionRevision,
    type TechnicalExecutionListQuery,
} from "@ardenfold/contracts";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
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
import { ExecutionStartService } from "../executions/management/execution-start.service";
import { ExecutionLifecycleService } from "../executions/revisions/execution-lifecycle.service";
import { ExecutionQueriesService } from "../executions/queries/execution-queries.service";

@ApiTags("technical-operations-executions")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("technical-executions")
export class TechnicalExecutionsController {
    constructor(
        private readonly startService: ExecutionStartService,
        private readonly lifecycle: ExecutionLifecycleService,
        private readonly queries: ExecutionQueriesService,
    ) {}

    @Post()
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "startTechnicalExecution" })
    @ApiBody({ schema: { $ref: "#/components/schemas/StartTechnicalExecution" } })
    start(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(startTechnicalExecutionSchema))
        input: StartTechnicalExecution,
    ) {
        return this.startService.start(principal, org.id, input);
    }

    @Get()
    @RequirePermissions("technical_executions.read")
    @ApiOperation({ operationId: "listTechnicalExecutions" })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(technicalExecutionListQuerySchema))
        query: TechnicalExecutionListQuery,
    ) {
        return this.queries.list(principal, org.id, query);
    }

    @Get(":executionId")
    @RequirePermissions("technical_executions.read")
    @ApiOperation({ operationId: "getTechnicalExecution" })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
    ) {
        return this.queries.get(principal, org.id, executionId);
    }

    @Patch(":executionId/revisions/:revisionId")
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "editTechnicalExecutionDraft" })
    @ApiBody({ schema: { $ref: "#/components/schemas/EditExecutionDraft" } })
    edit(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(editExecutionDraftSchema)) input: EditExecutionDraft,
    ) {
        return this.lifecycle.edit(principal, org.id, executionId, revisionId, input);
    }

    @Post(":executionId/revisions/:revisionId/submit")
    @HttpCode(200)
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "submitTechnicalExecutionRevision" })
    @ApiBody({ schema: { $ref: "#/components/schemas/SubmitExecutionRevision" } })
    submit(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(submitExecutionRevisionSchema))
        input: SubmitExecutionRevision,
    ) {
        return this.lifecycle.submit(principal, org.id, executionId, revisionId, input);
    }

    @Post(":executionId/revisions")
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "createTechnicalExecutionSuccessor" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreateSuccessorRevision" } })
    successor(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Body(new ContractValidationPipe(createSuccessorRevisionSchema))
        input: CreateSuccessorRevision,
    ) {
        return this.lifecycle.successor(principal, org.id, executionId, input);
    }

    @Post(":executionId/revisions/:revisionId/discard")
    @HttpCode(200)
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "discardTechnicalExecutionDraft" })
    @ApiBody({ schema: { $ref: "#/components/schemas/DiscardExecutionDraft" } })
    discard(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(discardExecutionDraftSchema)) input: DiscardExecutionDraft,
    ) {
        return this.lifecycle.discard(principal, org.id, executionId, revisionId, input);
    }

    @Post(":executionId/abandon")
    @HttpCode(200)
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "abandonTechnicalExecution" })
    @ApiBody({ schema: { $ref: "#/components/schemas/AbandonTechnicalExecution" } })
    abandon(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Body(new ContractValidationPipe(abandonTechnicalExecutionSchema))
        input: AbandonTechnicalExecution,
    ) {
        return this.lifecycle.abandon(principal, org.id, executionId, input);
    }
}
