import {
    correctReceiptSchema,
    createReceiptSchema,
    identifierSchema,
    type CorrectReceipt,
    type CreateReceipt,
} from "@ardenfold/contracts";
import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiBody,
    ApiCreatedResponse,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
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
import { ReceiptManagementService } from "../receipts/receipt-management.service";

@ApiTags("service-management-receipts")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("receipts")
export class ReceiptsController {
    constructor(private readonly receipts: ReceiptManagementService) {}

    @Post()
    @RequirePermissions("receipts.write")
    @ApiOperation({ operationId: "createReceipt" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreateReceipt" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/ReceiptDetail" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createReceiptSchema)) input: CreateReceipt,
    ) {
        return this.receipts.create(principal, org.id, input);
    }

    @Get("work-orders/:orderId")
    @RequirePermissions("receipts.read")
    @ApiOperation({ operationId: "listReceiptsForWorkOrder" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/ReceiptListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("orderId", new ContractValidationPipe(identifierSchema)) orderId: string,
    ) {
        return this.receipts.list(principal, org.id, orderId);
    }

    @Get(":receiptId")
    @RequirePermissions("receipts.read")
    @ApiOperation({ operationId: "getReceipt" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/ReceiptDetail" } })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("receiptId", new ContractValidationPipe(identifierSchema)) receiptId: string,
    ) {
        return this.receipts.get(principal, org.id, receiptId);
    }

    @Post(":receiptId/correct")
    @HttpCode(200)
    @RequirePermissions("receipts.write")
    @ApiOperation({ operationId: "correctReceipt" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CorrectReceipt" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/ReceiptDetail" } })
    correct(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("receiptId", new ContractValidationPipe(identifierSchema)) receiptId: string,
        @Body(new ContractValidationPipe(correctReceiptSchema)) input: CorrectReceipt,
    ) {
        return this.receipts.correct(principal, org.id, receiptId, input);
    }
}
