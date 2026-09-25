import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { DatabaseModule } from "../infrastructure/database/database.module";
import { AuthenticationGuard } from "./authentication/authentication.guard";
import { IdentityService } from "./authentication/identity.service";
import { AuthController } from "./authentication/http/auth.controller";
import { WorkosProfileService } from "./authentication/workos-profile.service";
import { WorkosTokenVerifier } from "./authentication/workos-token-verifier";
import { OrganizationAuthorizationGuard } from "./authorization/organization-authorization.guard";
import { OrganizationAuthorizationService } from "./authorization/organization-authorization.service";
import { InvitationAcceptanceController } from "./http/invitation-acceptance.controller";
import { OrganizationInvitationsController } from "./http/organization-invitations.controller";
import { OrganizationMembershipsController } from "./http/organization-memberships.controller";
import { OrganizationSitesController } from "./http/organization-sites.controller";
import { OrganizationsController } from "./http/organizations.controller";
import { InvitationManagementService } from "./invitations/invitation-management.service";
import { MembershipManagementService } from "./memberships/membership-management.service";
import { OrganizationLifecycleService } from "./organizations/organization-lifecycle.service";
import { SiteManagementService } from "./organizations/site-management.service";

@Module({
    imports: [DatabaseModule],
    controllers: [
        AuthController,
        OrganizationsController,
        OrganizationSitesController,
        OrganizationMembershipsController,
        OrganizationInvitationsController,
        InvitationAcceptanceController,
    ],
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
    exports: [OrganizationAuthorizationService, SiteManagementService],
})
export class AuthModule {}
