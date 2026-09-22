import {
    activeOrganizationResponseSchema,
    type ActiveOrganizationResponse,
    type OrganizationListResponse,
} from "@ardenfold/contracts";
import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import type { AuthenticatedPrincipal } from "./auth.types";
import { CurrentOrganization } from "./current-organization.decorator";
import { CurrentPrincipal } from "./current-principal.decorator";
import { OrganizationAuthorizationService } from "./organization-authorization.service";
import { organizationHeader, type ActiveOrganizationContext } from "./organization-context.types";
import { RequirePermissions } from "./require-permissions.decorator";

@ApiTags("organizations")
@ApiBearerAuth()
@Controller("organizations")
export class OrganizationsController {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    @Get()
    @ApiOperation({ operationId: "listAccessibleOrganizations" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
    ): Promise<OrganizationListResponse> {
        return this.authorization.listAccessibleOrganizations(principal.user.id);
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
}
