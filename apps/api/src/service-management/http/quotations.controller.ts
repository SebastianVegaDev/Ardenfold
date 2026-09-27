import {
    acceptQuoteRevisionSchema,
    copyQuoteRevisionSchema,
    createQuoteSchema,
    editQuoteDraftSchema,
    identifierSchema,
    issueQuoteRevisionSchema,
    quoteListQuerySchema,
    quoteVersionSchema,
    rejectQuoteRevisionSchema,
    type AcceptQuoteRevision,
    type CopyQuoteRevision,
    type CreateQuote,
    type EditQuoteDraft,
    type IssueQuoteRevision,
    type QuoteListQuery,
    type QuoteVersion,
    type RejectQuoteRevision,
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
import { QuoteAcceptanceService } from "../quotations/acceptance/quote-acceptance.service";
import { QuoteManagementService } from "../quotations/management/quote-management.service";
import { QuoteQueriesService } from "../quotations/queries/quote-queries.service";
import { QuoteRevisionsService } from "../quotations/revisions/quote-revisions.service";

@ApiTags("service-management-quotations")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("quotations")
export class QuotationsController {
    constructor(
        private readonly management: QuoteManagementService,
        private readonly revisions: QuoteRevisionsService,
        private readonly acceptance: QuoteAcceptanceService,
        private readonly queries: QuoteQueriesService,
    ) {}

    @Post()
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "createQuote" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreateQuote" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createQuoteSchema)) input: CreateQuote,
    ) {
        return this.management.create(principal, org.id, input);
    }

    @Get()
    @RequirePermissions("quotations.read")
    @ApiOperation({ operationId: "listQuotes" })
    @ApiQuery({ name: "limit", required: false, type: Number })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiQuery({ name: "status", required: false, enum: ["open", "accepted", "closed"] })
    @ApiQuery({ name: "requestId", required: false, type: String })
    @ApiQuery({ name: "customerPartyId", required: false, type: String })
    @ApiQuery({ name: "siteId", required: false, type: String })
    @ApiQuery({ name: "assetId", required: false, type: String })
    @ApiQuery({ name: "q", required: false, type: String })
    @ApiQuery({ name: "createdFrom", required: false, type: String })
    @ApiQuery({ name: "createdTo", required: false, type: String })
    @ApiQuery({ name: "sort", required: false, enum: ["newest", "oldest"] })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(quoteListQuerySchema)) query: QuoteListQuery,
    ) {
        return this.queries.list(principal, org.id, query);
    }

    @Get(":quoteId")
    @RequirePermissions("quotations.read")
    @ApiOperation({ operationId: "getQuote" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
    ) {
        return this.queries.get(principal, org.id, quoteId);
    }

    @Patch(":quoteId/revisions/:revisionId")
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "editQuoteDraft" })
    @ApiBody({ schema: { $ref: "#/components/schemas/EditQuoteDraft" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    edit(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(editQuoteDraftSchema)) input: EditQuoteDraft,
    ) {
        return this.revisions.edit(principal, org.id, quoteId, revisionId, input);
    }

    @Post(":quoteId/revisions")
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "copyQuoteRevision" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CopyQuoteRevision" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    copy(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Body(new ContractValidationPipe(copyQuoteRevisionSchema)) input: CopyQuoteRevision,
    ) {
        return this.revisions.copy(principal, org.id, quoteId, input);
    }

    @Post(":quoteId/revisions/:revisionId/issue")
    @HttpCode(200)
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "issueQuoteRevision" })
    @ApiBody({ schema: { $ref: "#/components/schemas/IssueQuoteRevision" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    issue(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(issueQuoteRevisionSchema)) input: IssueQuoteRevision,
    ) {
        return this.revisions.issue(principal, org.id, quoteId, revisionId, input);
    }

    @Post(":quoteId/revisions/:revisionId/discard")
    @HttpCode(200)
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "discardQuoteDraft" })
    @ApiBody({ schema: { $ref: "#/components/schemas/QuoteVersion" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    discard(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(quoteVersionSchema)) input: QuoteVersion,
    ) {
        return this.revisions.discard(principal, org.id, quoteId, revisionId, input);
    }

    @Post(":quoteId/revisions/:revisionId/withdraw")
    @HttpCode(200)
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "withdrawQuoteOffer" })
    @ApiBody({ schema: { $ref: "#/components/schemas/QuoteVersion" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    withdrawOffer(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(quoteVersionSchema)) input: QuoteVersion,
    ) {
        return this.revisions.withdrawOffer(principal, org.id, quoteId, revisionId, input);
    }

    @Post(":quoteId/revisions/:revisionId/expire")
    @HttpCode(200)
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "expireQuoteRevision" })
    @ApiBody({ schema: { $ref: "#/components/schemas/QuoteVersion" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    expire(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(quoteVersionSchema)) input: QuoteVersion,
    ) {
        return this.acceptance.expire(principal, org.id, quoteId, revisionId, input);
    }

    @Post(":quoteId/acceptances")
    @HttpCode(200)
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "acceptQuoteRevision" })
    @ApiBody({ schema: { $ref: "#/components/schemas/AcceptQuoteRevision" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteAcceptance" } })
    accept(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Body(new ContractValidationPipe(acceptQuoteRevisionSchema)) input: AcceptQuoteRevision,
    ) {
        return this.acceptance.accept(principal, org.id, quoteId, input);
    }

    @Post(":quoteId/reject")
    @HttpCode(200)
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "rejectQuoteRevision" })
    @ApiBody({ schema: { $ref: "#/components/schemas/RejectQuoteRevision" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    reject(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Body(new ContractValidationPipe(rejectQuoteRevisionSchema)) input: RejectQuoteRevision,
    ) {
        return this.acceptance.reject(principal, org.id, quoteId, input);
    }

    @Post(":quoteId/acceptances/withdraw")
    @HttpCode(200)
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "withdrawQuoteAcceptance" })
    @ApiBody({ schema: { $ref: "#/components/schemas/QuoteVersion" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    withdrawAcceptance(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Body(new ContractValidationPipe(quoteVersionSchema)) input: QuoteVersion,
    ) {
        return this.acceptance.withdraw(principal, org.id, quoteId, input);
    }

    @Post(":quoteId/close")
    @HttpCode(200)
    @RequirePermissions("quotations.write")
    @ApiOperation({ operationId: "closeQuote" })
    @ApiBody({ schema: { $ref: "#/components/schemas/QuoteVersion" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/QuoteDetail" } })
    close(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("quoteId", new ContractValidationPipe(identifierSchema)) quoteId: string,
        @Body(new ContractValidationPipe(quoteVersionSchema)) input: QuoteVersion,
    ) {
        return this.management.close(principal, org.id, quoteId, input);
    }
}
