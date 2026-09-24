import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PartiesController } from "./http/parties.controller";
import { PartyManagementService } from "./management/party-management.service";
import { PartyDetailsService } from "./queries/party-details.service";

@Module({
    imports: [AuthModule],
    controllers: [PartiesController],
    providers: [PartyManagementService, PartyDetailsService],
    exports: [PartyManagementService, PartyDetailsService],
})
export class PartiesModule {}
