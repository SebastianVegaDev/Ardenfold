import {
    identifierSchema,
    updateMembershipRoleRequestSchema,
    type UpdateMembershipRoleRequest,
} from "@ardenfold/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
    ApiBearerAuth,
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
import { MembershipManagementService } from "../memberships/membership-management.service";
import { CurrentOrganization } from "../organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../organization-context/organization-context.types";

@ApiTags("organizations")
@ApiBearerAuth()
@Controller("organizations/current/members")
export class OrganizationMembershipsController {
    constructor(private readonly memberships: MembershipManagementService) {}

    @Get()
    @RequirePermissions("members.read")
    @ApiHeader({ name: organizationHeader, required: true })
    @ApiOperation({ operationId: "listOrganizationMembers" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OrganizationMemberListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
    ) {
        return this.memberships.listMembers(principal, organization.id);
    }

    @Patch(":membershipId/role")
    @RequirePermissions("members.manage")
    @ApiHeader({ name: organizationHeader, required: true })
    @HttpCode(204)
    @ApiNoContentResponse()
    updateRole(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("membershipId", new ContractValidationPipe(identifierSchema)) membershipId: string,
        @Body(new ContractValidationPipe(updateMembershipRoleRequestSchema))
        input: UpdateMembershipRoleRequest,
    ) {
        return this.memberships.updateMembershipRole(
            principal,
            organization.id,
            membershipId,
            input,
        );
    }

    @Post(":membershipId/suspend")
    @RequirePermissions("members.manage")
    @ApiHeader({ name: organizationHeader, required: true })
    @HttpCode(204)
    @ApiNoContentResponse()
    suspend(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("membershipId", new ContractValidationPipe(identifierSchema)) membershipId: string,
    ) {
        return this.memberships.suspendMembership(principal, organization.id, membershipId);
    }

    @Delete(":membershipId")
    @RequirePermissions("members.manage")
    @ApiHeader({ name: organizationHeader, required: true })
    @HttpCode(204)
    @ApiNoContentResponse()
    remove(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("membershipId", new ContractValidationPipe(identifierSchema)) membershipId: string,
    ) {
        return this.memberships.removeMembership(principal, organization.id, membershipId);
    }
}
