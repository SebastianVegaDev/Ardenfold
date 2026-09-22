import {
    acceptInvitationRequestSchema,
    activeOrganizationResponseSchema,
    createInvitationRequestSchema,
    createOrganizationRequestSchema,
    createOrganizationSiteRequestSchema,
    identifierSchema,
    updateMembershipRoleRequestSchema,
    updateOrganizationRequestSchema,
    type AcceptInvitationRequest,
    type ActiveOrganizationResponse,
    type CreateInvitationRequest,
    type CreateOrganizationRequest,
    type CreateOrganizationSiteRequest,
    type OrganizationListResponse,
    type UpdateMembershipRoleRequest,
    type UpdateOrganizationRequest,
} from "@ardenfold/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { ContractValidationPipe } from "../http/contracts";
import type { AuthenticatedPrincipal } from "./auth.types";
import { CurrentOrganization } from "./current-organization.decorator";
import { CurrentPrincipal } from "./current-principal.decorator";
import { OrganizationAuthorizationService } from "./organization-authorization.service";
import { organizationHeader, type ActiveOrganizationContext } from "./organization-context.types";
import { RequirePermissions } from "./require-permissions.decorator";
import { OrganizationManagementService } from "./organization-management.service";

@ApiTags("organizations")
@ApiBearerAuth()
@Controller("organizations")
export class OrganizationsController {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly management: OrganizationManagementService,
    ) {}

    @Get()
    @ApiOperation({ operationId: "listAccessibleOrganizations" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
    ): Promise<OrganizationListResponse> {
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
        return this.management.createOrganization(principal, input);
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
        return this.management.updateOrganization(principal, organization.id, input);
    }

    @Post("current/sites")
    @RequirePermissions("sites.manage")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "createOrganizationSite" })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/OrganizationSite" } })
    createSite(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createOrganizationSiteRequestSchema))
        input: CreateOrganizationSiteRequest,
    ) {
        return this.management.createSite(principal, organization.id, input);
    }

    @Get("current/sites")
    @RequirePermissions("sites.read")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "listOrganizationSites" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationSiteListResponse" } })
    listSites(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
    ) {
        return this.management.listSites(principal, organization.id);
    }

    @Get("current/members")
    @RequirePermissions("members.read")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "listOrganizationMembers" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationMemberListResponse" } })
    listMembers(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
    ) {
        return this.management.listMembers(principal, organization.id);
    }

    @Patch("current/members/:membershipId/role")
    @RequirePermissions("members.manage")
    @ApiHeader({ name: organizationHeader, required: true })
    @HttpCode(204)
    @ApiNoContentResponse()
    updateMemberRole(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("membershipId", new ContractValidationPipe(identifierSchema)) membershipId: string,
        @Body(new ContractValidationPipe(updateMembershipRoleRequestSchema))
        input: UpdateMembershipRoleRequest,
    ) {
        return this.management.updateMembershipRole(principal, organization.id, membershipId, input);
    }

    @Post("current/members/:membershipId/suspend")
    @RequirePermissions("members.manage")
    @ApiHeader({ name: organizationHeader, required: true })
    @HttpCode(204)
    @ApiNoContentResponse()
    suspendMember(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("membershipId", new ContractValidationPipe(identifierSchema)) membershipId: string,
    ) {
        return this.management.suspendMembership(principal, organization.id, membershipId);
    }

    @Delete("current/members/:membershipId")
    @RequirePermissions("members.manage")
    @ApiHeader({ name: organizationHeader, required: true })
    @HttpCode(204)
    @ApiNoContentResponse()
    removeMember(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("membershipId", new ContractValidationPipe(identifierSchema)) membershipId: string,
    ) {
        return this.management.removeMembership(principal, organization.id, membershipId);
    }

    @Get("current/invitations")
    @RequirePermissions("members.read")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationInvitationListResponse" } })
    listInvitations(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
    ) {
        return this.management.listInvitations(principal, organization.id);
    }

    @Post("current/invitations")
    @RequirePermissions("members.invite")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/CreatedInvitationResponse" } })
    invite(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createInvitationRequestSchema)) input: CreateInvitationRequest,
    ) {
        return this.management.createInvitation(principal, organization.id, input);
    }

    @Delete("current/invitations/:invitationId")
    @RequirePermissions("members.invite")
    @ApiHeader({ name: organizationHeader, required: true })
    @HttpCode(204)
    @ApiNoContentResponse()
    cancelInvitation(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("invitationId", new ContractValidationPipe(identifierSchema)) invitationId: string,
    ) {
        return this.management.cancelInvitation(principal, organization.id, invitationId);
    }
}

@ApiTags("invitations")
@ApiBearerAuth()
@Controller("invitations")
export class InvitationsController {
    constructor(private readonly management: OrganizationManagementService) {}

    @Post("accept")
    @ApiOperation({ operationId: "acceptOrganizationInvitation" })
    @ApiOkResponse({ schema: { type: "object", properties: { organizationId: { type: "string", format: "uuid" } }, required: ["organizationId"] } })
    accept(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @Body(new ContractValidationPipe(acceptInvitationRequestSchema)) input: AcceptInvitationRequest,
    ) {
        return this.management.acceptInvitation(principal, input);
    }
}
