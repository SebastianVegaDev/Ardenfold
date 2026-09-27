import {
    identifierSchema,
    operationalQueueQuerySchema,
    requestTimelineQuerySchema,
    type OperationalQueueQuery,
    type RequestTimelineQuery,
} from "@ardenfold/contracts";
import { Controller, Get, Param, Query } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from "@nestjs/swagger";

import { CurrentPrincipal } from "../../auth/authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { RequirePermissions } from "../../auth/authorization/require-permissions.decorator";
import { CurrentOrganization } from "../../auth/organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../../auth/organization-context/organization-context.types";
import { ContractValidationPipe } from "../../http/contracts";
import { OperationalQueuesService } from "../queries/operational-queues.service";
import { RequestTimelineService } from "../queries/request-timeline.service";

@ApiTags("service-management-operations")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("service-management")
export class OperationalViewsController {
    constructor(
        private readonly queues: OperationalQueuesService,
        private readonly timeline: RequestTimelineService,
    ) {}

    @Get("queues")
    @RequirePermissions(
        "service_requests.read",
        "quotations.read",
        "work_orders.read",
        "receipts.read",
        "parties.read",
        "assets.read",
    )
    @ApiOperation({ operationId: "listOperationalQueue" })
    @ApiQuery({
        name: "kind",
        required: true,
        enum: [
            "commercial_follow_up",
            "awaiting_customer",
            "accepted_unoperationalized",
            "active_work",
            "items_not_ready",
            "intake_needed",
        ],
    })
    @ApiQuery({ name: "limit", required: false, type: Number })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiQuery({ name: "customerPartyId", required: false, type: String })
    @ApiQuery({ name: "siteId", required: false, type: String })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/OperationalQueueResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(operationalQueueQuerySchema))
        query: OperationalQueueQuery,
    ) {
        return this.queues.list(principal, org.id, query);
    }

    @Get("requests/:requestId/timeline")
    @RequirePermissions(
        "service_requests.read",
        "quotations.read",
        "work_orders.read",
        "receipts.read",
        "parties.read",
        "assets.read",
    )
    @ApiOperation({ operationId: "getServiceRequestTimeline" })
    @ApiQuery({ name: "limit", required: false, type: Number })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/RequestTimelineResponse" } })
    getTimeline(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("requestId", new ContractValidationPipe(identifierSchema)) requestId: string,
        @Query(new ContractValidationPipe(requestTimelineQuerySchema)) query: RequestTimelineQuery,
    ) {
        return this.timeline.get(principal, org.id, requestId, query);
    }
}
