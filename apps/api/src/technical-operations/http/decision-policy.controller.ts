import { technicalDecisionPolicySchema, type TechnicalDecisionPolicy } from "@ardenfold/contracts";
import { Body, Controller, Get, Patch } from "@nestjs/common";
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
import { TechnicalDecisionPolicyService } from "../reviews/decision-policy.service";

@ApiTags("technical-operations-decisions")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("technical-decision-policy")
export class TechnicalDecisionPolicyController {
    constructor(private readonly policy: TechnicalDecisionPolicyService) {}

    @Get()
    @RequirePermissions("organization.read")
    @ApiOperation({ operationId: "getTechnicalDecisionPolicy" })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
    ) {
        return this.policy.get(principal, org.id);
    }

    @Patch()
    @RequirePermissions("organization.update")
    @ApiOperation({ operationId: "updateTechnicalDecisionPolicy" })
    @ApiBody({ schema: { $ref: "#/components/schemas/TechnicalDecisionPolicy" } })
    update(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(technicalDecisionPolicySchema))
        input: TechnicalDecisionPolicy,
    ) {
        return this.policy.update(principal, org.id, input);
    }
}
