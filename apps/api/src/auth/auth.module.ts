import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { DatabaseModule } from "../infrastructure/database/database.module";
import { AuthController } from "./auth.controller";
import { AuthenticationGuard } from "./authentication.guard";
import { IdentityService } from "./identity.service";
import { WorkosProfileService } from "./workos-profile.service";
import { WorkosTokenVerifier } from "./workos-token-verifier";
import { OrganizationAuthorizationService } from "./organization-authorization.service";
import { OrganizationAuthorizationGuard } from "./organization-authorization.guard";
import { OrganizationsController } from "./organizations.controller";

@Module({
    imports: [DatabaseModule],
    controllers: [AuthController, OrganizationsController],
    providers: [
        WorkosTokenVerifier,
        WorkosProfileService,
        IdentityService,
        OrganizationAuthorizationService,
        {
            provide: APP_GUARD,
            useClass: AuthenticationGuard,
        },
        {
            provide: APP_GUARD,
            useClass: OrganizationAuthorizationGuard,
        },
    ],
})
export class AuthModule {}
