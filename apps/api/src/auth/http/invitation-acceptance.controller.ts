import { acceptInvitationRequestSchema, type AcceptInvitationRequest } from "@ardenfold/contracts";
import { Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { ContractValidationPipe } from "../../http/contracts";
import { CurrentPrincipal } from "../authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../authentication/types";
import { InvitationManagementService } from "../invitations/invitation-management.service";

@ApiTags("invitations")
@ApiBearerAuth()
@Controller("invitations")
export class InvitationAcceptanceController {
    constructor(private readonly invitations: InvitationManagementService) {}

    @Post("accept")
    @ApiOperation({ operationId: "acceptOrganizationInvitation" })
    @ApiOkResponse({
        schema: {
            type: "object",
            properties: { organizationId: { type: "string", format: "uuid" } },
            required: ["organizationId"],
        },
    })
    accept(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @Body(new ContractValidationPipe(acceptInvitationRequestSchema))
        input: AcceptInvitationRequest,
    ) {
        return this.invitations.acceptInvitation(principal, input);
    }
}
