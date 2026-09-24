import {
    createInvitationRequestSchema,
    identifierSchema,
    type CreateInvitationRequest,
} from "@ardenfold/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiHeader,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from "@nestjs/swagger";

import { ContractValidationPipe } from "../../http/contracts";
import { CurrentPrincipal } from "../authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../authentication/types";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { InvitationManagementService } from "../invitations/invitation-management.service";
import { CurrentOrganization } from "../organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../organization-context/organization-context.types";

@ApiTags("organizations")
@ApiBearerAuth()
@Controller("organizations/current/invitations")
export class OrganizationInvitationsController {
    constructor(private readonly invitations: InvitationManagementService) {}

    @Get()
    @RequirePermissions("members.read")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "listOrganizationInvitations" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationInvitationListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
    ) {
        return this.invitations.listInvitations(principal, organization.id);
    }

    @Post()
    @RequirePermissions("members.invite")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "createOrganizationInvitation" })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/CreatedInvitationResponse" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createInvitationRequestSchema))
        input: CreateInvitationRequest,
    ) {
        return this.invitations.createInvitation(principal, organization.id, input);
    }

    @Delete(":invitationId")
    @RequirePermissions("members.invite")
    @ApiHeader({ name: organizationHeader, required: true })
    @HttpCode(204)
    @ApiNoContentResponse()
    cancel(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("invitationId", new ContractValidationPipe(identifierSchema)) invitationId: string,
    ) {
        return this.invitations.cancelInvitation(principal, organization.id, invitationId);
    }
}
