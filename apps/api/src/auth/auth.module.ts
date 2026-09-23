import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { DatabaseModule } from "../infrastructure/database/database.module";
import { AuthController } from "./auth.controller";
import { AuthenticationGuard } from "./authentication.guard";
import { IdentityService } from "./identity.service";
import { InvitationManagementService } from "./organization-management/invitation-management.service";
import { MembershipManagementService } from "./organization-management/membership-management.service";
import { OrganizationLifecycleService } from "./organization-management/organization-lifecycle.service";
import { SiteManagementService } from "./organization-management/site-management.service";
import { OrganizationAuthorizationGuard } from "./organization-authorization.guard";
import { OrganizationAuthorizationService } from "./organization-authorization.service";
import { InvitationsController, OrganizationsController } from "./organizations.controller";
import { WorkosProfileService } from "./workos-profile.service";
import { WorkosTokenVerifier } from "./workos-token-verifier";

@Module({
    imports: [DatabaseModule],
    controllers: [AuthController, OrganizationsController, InvitationsController],
    providers: [
        WorkosTokenVerifier,
        WorkosProfileService,
        IdentityService,
        OrganizationAuthorizationService,
        OrganizationLifecycleService,
        SiteManagementService,
        MembershipManagementService,
        InvitationManagementService,
        {
            provide: APP_GUARD,
            useClass: AuthenticationGuard,
        },
        {
            provide: APP_GUARD,
            useClass: OrganizationAuthorizationGuard,
        },
    ],
    exports: [OrganizationAuthorizationService],
})
export class AuthModule {}