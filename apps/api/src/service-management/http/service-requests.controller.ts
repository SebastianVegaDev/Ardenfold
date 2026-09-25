import {
    createServiceRequestSchema,
    identifierSchema,
    serviceRequestListQuerySchema,
    transitionServiceRequestSchema,
    updateServiceRequestSchema,
    type CreateServiceRequest,
    type ServiceRequestListQuery,
    type TransitionServiceRequest,
    type UpdateServiceRequest,
} from "@ardenfold/contracts";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiBody,
    ApiCreatedResponse,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from "@nestjs/swagger";

import { CurrentPrincipal } from "../../auth/authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { RequirePermissions } from "../../auth/authorization/require-permissions.decorator";
import { CurrentOrganization } from "../../auth/organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../../auth/organization-context/organization-context.types";
import { ContractValidationPipe } from "../../http/contracts";
import { RequestManagementService } from "../requests/request-management.service";
import { RequestQueriesService } from "../requests/request-queries.service";

@ApiTags("service-management-requests")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("service-requests")
export class ServiceRequestsController {
    constructor(
        private readonly management: RequestManagementService,
        private readonly queries: RequestQueriesService,
    ) {}

    @Post()
    @RequirePermissions("service_requests.write")
    @ApiOperation({ operationId: "createServiceRequest" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreateServiceRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/ServiceRequestDetail" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createServiceRequestSchema)) input: CreateServiceRequest,
    ) {
        return this.management.create(principal, org.id, input);
    }

    @Get()
    @RequirePermissions("service_requests.read")
    @ApiOperation({ operationId: "listServiceRequests" })
    @ApiQuery({ name: "limit", required: false, type: Number })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiQuery({ name: "status", required: false, enum: ["active", "cancelled", "closed"] })
    @ApiQuery({ name: "customerPartyId", required: false, type: String })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/ServiceRequestListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(serviceRequestListQuerySchema))
        query: ServiceRequestListQuery,
    ) {
        return this.queries.list(principal, org.id, query);
    }

    @Get(":requestId")
    @RequirePermissions("service_requests.read")
    @ApiOperation({ operationId: "getServiceRequest" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/ServiceRequestDetail" } })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("requestId", new ContractValidationPipe(identifierSchema)) requestId: string,
    ) {
        return this.queries.get(principal, org.id, requestId);
    }

    @Patch(":requestId")
    @RequirePermissions("service_requests.write")
    @ApiOperation({ operationId: "updateServiceRequest" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdateServiceRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/ServiceRequestDetail" } })
    update(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("requestId", new ContractValidationPipe(identifierSchema)) requestId: string,
        @Body(new ContractValidationPipe(updateServiceRequestSchema)) input: UpdateServiceRequest,
    ) {
        return this.management.update(principal, org.id, requestId, input);
    }

    @Post(":requestId/cancel")
    @HttpCode(200)
    @RequirePermissions("service_requests.write")
    @ApiOperation({ operationId: "cancelServiceRequest" })
    @ApiBody({ schema: { $ref: "#/components/schemas/TransitionServiceRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/ServiceRequestDetail" } })
    cancel(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("requestId", new ContractValidationPipe(identifierSchema)) requestId: string,
        @Body(new ContractValidationPipe(transitionServiceRequestSchema))
        input: TransitionServiceRequest,
    ) {
        return this.management.transition(principal, org.id, requestId, "cancelled", input);
    }

    @Post(":requestId/close")
    @HttpCode(200)
    @RequirePermissions("service_requests.write")
    @ApiOperation({ operationId: "closeServiceRequest" })
    @ApiBody({ schema: { $ref: "#/components/schemas/TransitionServiceRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/ServiceRequestDetail" } })
    close(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("requestId", new ContractValidationPipe(identifierSchema)) requestId: string,
        @Body(new ContractValidationPipe(transitionServiceRequestSchema))
        input: TransitionServiceRequest,
    ) {
        return this.management.transition(principal, org.id, requestId, "closed", input);
    }
}
