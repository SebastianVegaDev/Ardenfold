import {
    createOrganizationSiteRequestSchema,
    type CreateOrganizationSiteRequest,
} from "@ardenfold/contracts";
import { Body, Controller, Get, Post } from "@nestjs/common";
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
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { CurrentOrganization } from "../organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../organization-context/organization-context.types";
import { SiteManagementService } from "../organizations/site-management.service";

@ApiTags("organizations")
@ApiBearerAuth()
@Controller("organizations/current/sites")
export class OrganizationSitesController {
    constructor(private readonly sites: SiteManagementService) {}

    @Post()
    @RequirePermissions("sites.manage")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "createOrganizationSite" })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/OrganizationSite" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createOrganizationSiteRequestSchema))
        input: CreateOrganizationSiteRequest,
    ) {
        return this.sites.createSite(principal, organization.id, input);
    }

    @Get()
    @RequirePermissions("sites.read")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "listOrganizationSites" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationSiteListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
    ) {
        return this.sites.listSites(principal, organization.id);
    }
}
