import { Module } from "@nestjs/common";

import { AssetsModule } from "../assets/assets.module";
import { AuthModule } from "../auth/auth.module";
import { PartiesModule } from "../parties/parties.module";
import { ServiceRequestsController } from "./http/service-requests.controller";
import { RequestManagementService } from "./requests/request-management.service";
import { RequestQueriesService } from "./requests/request-queries.service";

@Module({
    imports: [AuthModule, PartiesModule, AssetsModule],
    controllers: [ServiceRequestsController],
    providers: [RequestManagementService, RequestQueriesService],
})
export class ServiceManagementModule {}
