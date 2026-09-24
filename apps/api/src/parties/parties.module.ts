import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PartiesController } from "./parties.controller";
import { PartyDetailsService } from "./party-details.service";
import { PartyManagementService } from "./party-management.service";

@Module({
    imports: [AuthModule],
    controllers: [PartiesController],
    providers: [PartyManagementService, PartyDetailsService],
    exports: [PartyManagementService, PartyDetailsService],
})
export class PartiesModule {}
