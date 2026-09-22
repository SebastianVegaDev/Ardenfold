import {
    authenticatedUserResponseSchema,
    type AuthenticatedUserResponse,
} from "@ardenfold/contracts";
import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentPrincipal } from "./current-principal.decorator";
import type { AuthenticatedPrincipal } from "./auth.types";

@ApiTags("authentication")
@ApiBearerAuth()
@Controller("auth")
export class AuthController {
    @Get("me")
    @ApiOperation({ operationId: "getAuthenticatedUser" })
    @ApiOkResponse({
        schema: { $ref: "#/components/schemas/AuthenticatedUserResponse" },
    })
    getAuthenticatedUser(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
    ): AuthenticatedUserResponse {
        return authenticatedUserResponseSchema.parse({
            user: {
                id: principal.user.id,
                email: principal.user.primaryEmail,
                displayName: principal.user.displayName,
            },
            session: {
                id: principal.sessionId,
            },
        });
    }
}
