import { Module } from "@nestjs/common";

import { AssetsModule } from "../assets/assets.module";
import { AuthModule } from "../auth/auth.module";
import { PartiesModule } from "../parties/parties.module";
import { ServiceRequestsController } from "./http/service-requests.controller";
import { OperationalViewsController } from "./http/operational-views.controller";
import { QuotationsController } from "./http/quotations.controller";
import { WorkOrdersController } from "./http/work-orders.controller";
import { ReceiptsController } from "./http/receipts.controller";
import { CustodyCoordination } from "./receipts/custody-coordination";
import { ReceiptManagementService } from "./receipts/receipt-management.service";
import { QuoteAcceptanceService } from "./quotations/acceptance/quote-acceptance.service";
import { QuoteManagementService } from "./quotations/management/quote-management.service";
import { QuoteQueriesService } from "./quotations/queries/quote-queries.service";
import { QuoteRevisionsService } from "./quotations/revisions/quote-revisions.service";
import { RequestManagementService } from "./requests/request-management.service";
import { RequestQueriesService } from "./requests/request-queries.service";
import { OperationalQueuesService } from "./queries/operational-queues.service";
import { RequestTimelineService } from "./queries/request-timeline.service";
import { WorkOrderManagementService } from "./work-orders/management/work-order-management.service";
import { WorkOrderQueriesService } from "./work-orders/queries/work-order-queries.service";
import { WorkItemsService } from "./work-orders/work-items/work-items.service";

@Module({
    imports: [AuthModule, PartiesModule, AssetsModule],
    controllers: [
        ServiceRequestsController,
        QuotationsController,
        WorkOrdersController,
        ReceiptsController,
        OperationalViewsController,
    ],
    providers: [
        RequestManagementService,
        RequestQueriesService,
        QuoteManagementService,
        QuoteRevisionsService,
        QuoteAcceptanceService,
        QuoteQueriesService,
        WorkOrderManagementService,
        WorkOrderQueriesService,
        WorkItemsService,
        CustodyCoordination,
        ReceiptManagementService,
        OperationalQueuesService,
        RequestTimelineService,
    ],
})
export class ServiceManagementModule {}
