import {
    createWorkOrderSchema,
    identifierSchema,
    restructureWorkItemSchema,
    updateWorkItemSchema,
    updateWorkOrderSchema,
    workItemTransitionSchema,
    workOrderListQuerySchema,
    workOrderTransitionSchema,
    type CreateWorkOrder,
    type RestructureWorkItem,
    type UpdateWorkItem,
    type UpdateWorkOrder,
    type WorkItemTransition,
    type WorkOrderListQuery,
    type WorkOrderTransition,
} from "@ardenfold/contracts";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiBody,
    ApiCreatedResponse,
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
import { WorkOrderManagementService } from "../work-orders/management/work-order-management.service";
import { WorkOrderQueriesService } from "../work-orders/queries/work-order-queries.service";
import { WorkItemsService } from "../work-orders/work-items/work-items.service";

@ApiTags("service-management-work-orders")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("work-orders")
export class WorkOrdersController {
    constructor(
        private readonly management: WorkOrderManagementService,
        private readonly items: WorkItemsService,
        private readonly queries: WorkOrderQueriesService,
    ) {}

    @Post()
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "createWorkOrder" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreateWorkOrder" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createWorkOrderSchema)) input: CreateWorkOrder,
    ) {
        return this.management.create(principal, org.id, input);
    }

    @Get()
    @RequirePermissions("work_orders.read")
    @ApiOperation({ operationId: "listWorkOrders" })
    @ApiQuery({ name: "limit", required: false, type: Number })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiQuery({ name: "status", required: false, enum: ["planned", "ready", "cancelled"] })
    @ApiQuery({ name: "requestId", required: false, type: String })
    @ApiQuery({ name: "siteId", required: false, type: String })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(workOrderListQuerySchema)) query: WorkOrderListQuery,
    ) {
        return this.queries.list(principal, org.id, query);
    }

    @Get(":orderId")
    @RequirePermissions("work_orders.read")
    @ApiOperation({ operationId: "getWorkOrder" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
    ) {
        return this.queries.get(principal, org.id, orderId);
    }

    @Get(":orderId/readiness")
    @RequirePermissions(
        "work_orders.read",
        "sites.read",
        "parties.read",
        "assets.read",
        "receipts.read",
    )
    @ApiOperation({ operationId: "getWorkOrderReadiness" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderReadinessResponse" } })
    readiness(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
    ) {
        return this.queries.readiness(principal, org.id, orderId);
    }

    @Patch(":orderId")
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "updateWorkOrder" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdateWorkOrder" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    update(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
        @Body(new ContractValidationPipe(updateWorkOrderSchema)) input: UpdateWorkOrder,
    ) {
        return this.management.update(principal, org.id, orderId, input);
    }

    @Post(":orderId/ready")
    @HttpCode(200)
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "readyWorkOrder" })
    @ApiBody({ schema: { $ref: "#/components/schemas/WorkOrderTransition" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    ready(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
        @Body(new ContractValidationPipe(workOrderTransitionSchema)) input: WorkOrderTransition,
    ) {
        return this.management.transitionReadiness(principal, org.id, orderId, "ready", input);
    }

    @Post(":orderId/planned")
    @HttpCode(200)
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "planWorkOrder" })
    @ApiBody({ schema: { $ref: "#/components/schemas/WorkOrderTransition" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    plan(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
        @Body(new ContractValidationPipe(workOrderTransitionSchema)) input: WorkOrderTransition,
    ) {
        return this.management.transitionReadiness(principal, org.id, orderId, "planned", input);
    }

    @Post(":orderId/cancel")
    @HttpCode(200)
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "cancelWorkOrder" })
    @ApiBody({ schema: { $ref: "#/components/schemas/WorkOrderTransition" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    cancel(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
        @Body(new ContractValidationPipe(workOrderTransitionSchema)) input: WorkOrderTransition,
    ) {
        return this.management.cancel(principal, org.id, orderId, input);
    }

    @Patch(":orderId/items/:itemId")
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "updateWorkItem" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdateWorkItem" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    updateItem(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
        @Param("itemId", new ContractValidationPipe(identifierSchema)) itemId: string,
        @Body(new ContractValidationPipe(updateWorkItemSchema)) input: UpdateWorkItem,
    ) {
        return this.items.update(principal, org.id, orderId, itemId, input);
    }

    @Post(":orderId/items/:itemId/restructure")
    @HttpCode(200)
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "restructureWorkItem" })
    @ApiBody({ schema: { $ref: "#/components/schemas/RestructureWorkItem" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    restructure(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
        @Param("itemId", new ContractValidationPipe(identifierSchema)) itemId: string,
        @Body(new ContractValidationPipe(restructureWorkItemSchema)) input: RestructureWorkItem,
    ) {
        return this.items.restructure(principal, org.id, orderId, itemId, input);
    }

    @Post(":orderId/items/:itemId/ready")
    @HttpCode(200)
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "readyWorkItem" })
    @ApiBody({ schema: { $ref: "#/components/schemas/WorkItemTransition" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    readyItem(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
        @Param("itemId", new ContractValidationPipe(identifierSchema)) itemId: string,
        @Body(new ContractValidationPipe(workItemTransitionSchema)) input: WorkItemTransition,
    ) {
        return this.items.transition(principal, org.id, orderId, itemId, "ready", input);
    }

    @Post(":orderId/items/:itemId/planned")
    @HttpCode(200)
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "planWorkItem" })
    @ApiBody({ schema: { $ref: "#/components/schemas/WorkItemTransition" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    planItem(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
        @Param("itemId", new ContractValidationPipe(identifierSchema)) itemId: string,
        @Body(new ContractValidationPipe(workItemTransitionSchema)) input: WorkItemTransition,
    ) {
        return this.items.transition(principal, org.id, orderId, itemId, "planned", input);
    }

    @Post(":orderId/items/:itemId/cancel")
    @HttpCode(200)
    @RequirePermissions("work_orders.write")
    @ApiOperation({ operationId: "cancelWorkItem" })
    @ApiBody({ schema: { $ref: "#/components/schemas/WorkItemTransition" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/WorkOrderDetail" } })
    cancelItem(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
        @Param("itemId", new ContractValidationPipe(identifierSchema)) itemId: string,
        @Body(new ContractValidationPipe(workItemTransitionSchema)) input: WorkItemTransition,
    ) {
        return this.items.transition(principal, org.id, orderId, itemId, "cancelled", input);
    }
}
