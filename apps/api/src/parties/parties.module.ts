import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PartiesController } from "./http/parties.controller";
import { PartyManagementService } from "./management/party-management.service";
import { PartyDetailsService } from "./queries/party-details.service";
import { PartyReferenceService } from "./queries/party-reference.service";

@Module({
    imports: [AuthModule],
    controllers: [PartiesController],
    providers: [PartyManagementService, PartyDetailsService, PartyReferenceService],
    exports: [PartyManagementService, PartyDetailsService, PartyReferenceService],
})
export class PartiesModule {}
