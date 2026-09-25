import { Module } from "@nestjs/common";

import { AssetsModule } from "../assets/assets.module";
import { AuthModule } from "../auth/auth.module";
import { PartiesModule } from "../parties/parties.module";
import { ServiceRequestsController } from "./http/service-requests.controller";
import { QuotationsController } from "./http/quotations.controller";
import { QuoteAcceptanceService } from "./quotations/acceptance/quote-acceptance.service";
import { QuoteManagementService } from "./quotations/management/quote-management.service";
import { QuoteQueriesService } from "./quotations/queries/quote-queries.service";
import { QuoteRevisionsService } from "./quotations/revisions/quote-revisions.service";
import { RequestManagementService } from "./requests/request-management.service";
import { RequestQueriesService } from "./requests/request-queries.service";

@Module({
    imports: [AuthModule, PartiesModule, AssetsModule],
    controllers: [ServiceRequestsController, QuotationsController],
    providers: [
        RequestManagementService,
        RequestQueriesService,
        QuoteManagementService,
        QuoteRevisionsService,
        QuoteAcceptanceService,
        QuoteQueriesService,
    ],
})
export class ServiceManagementModule {}
