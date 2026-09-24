import {
    activeOrganizationResponseSchema,
    createOrganizationRequestSchema,
    updateOrganizationRequestSchema,
    type ActiveOrganizationResponse,
    type CreateOrganizationRequest,
    type OrganizationListResponse,
    type UpdateOrganizationRequest,
} from "@ardenfold/contracts";
import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from "@nestjs/swagger";

import { ContractValidationPipe } from "../../http/contracts";
import { CurrentPrincipal } from "../authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../authentication/types";
import { OrganizationAuthorizationService } from "../authorization/organization-authorization.service";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { CurrentOrganization } from "../organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../organization-context/organization-context.types";
import { OrganizationLifecycleService } from "../organizations/organization-lifecycle.service";

@ApiTags("organizations")
@ApiBearerAuth()
@Controller("organizations")
export class OrganizationsController {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly organizations: OrganizationLifecycleService,
    ) {}

    @Get()
    @ApiOperation({ operationId: "listAccessibleOrganizations" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationListResponse" } })
    list(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<OrganizationListResponse> {
        return this.authorization.listAccessibleOrganizations(principal.user.id);
    }

    @Post()
    @ApiOperation({ operationId: "createOrganization" })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/OrganizationSummary" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @Body(new ContractValidationPipe(createOrganizationRequestSchema))
        input: CreateOrganizationRequest,
    ) {
        return this.organizations.createOrganization(principal, input);
    }

    @Get("current")
    @RequirePermissions("organization.read")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "getActiveOrganization" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/ActiveOrganizationResponse" } })
    current(
        @CurrentOrganization() organization: ActiveOrganizationContext,
    ): ActiveOrganizationResponse {
        return activeOrganizationResponseSchema.parse(organization);
    }

    @Patch("current")
    @RequirePermissions("organization.update")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "updateActiveOrganization" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationSummary" } })
    updateCurrent(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(updateOrganizationRequestSchema))
        input: UpdateOrganizationRequest,
    ) {
        return this.organizations.updateOrganization(principal, organization.id, input);
    }
}
