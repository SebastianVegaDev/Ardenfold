import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { DatabaseModule } from "../infrastructure/database/database.module";
import { AuthController } from "./auth.controller";
import { AuthenticationGuard } from "./authentication.guard";
import { IdentityService } from "./identity.service";
import { WorkosProfileService } from "./workos-profile.service";
import { WorkosTokenVerifier } from "./workos-token-verifier";

@Module({
    imports: [DatabaseModule],
    controllers: [AuthController],
    providers: [
        WorkosTokenVerifier,
        WorkosProfileService,
        IdentityService,
        {
            provide: APP_GUARD,
            useClass: AuthenticationGuard,
        },
    ],
})
export class AuthModule {}
