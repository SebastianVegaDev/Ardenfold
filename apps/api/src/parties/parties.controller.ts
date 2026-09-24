import {
    addPartyIdentifierRequestSchema,
    createPartyAddressRequestSchema,
    createPartyContactChannelRequestSchema,
    createPartyContactRequestSchema,
    createPartyRequestSchema,
    identifierSchema,
    partyListQuerySchema,
    partyVersionRequestSchema,
    setPartyRolesRequestSchema,
    updatePartyAddressRequestSchema,
    updatePartyContactRequestSchema,
    updatePartyContactChannelRequestSchema,
    updatePartyRequestSchema,
    type AddPartyIdentifierRequest,
    type CreatePartyAddressRequest,
    type CreatePartyContactChannelRequest,
    type CreatePartyContactRequest,
    type CreatePartyRequest,
    type PartyListQuery,
    type PartyVersionRequest,
    type SetPartyRolesRequest,
    type UpdatePartyAddressRequest,
    type UpdatePartyContactRequest,
    type UpdatePartyContactChannelRequest,
    type UpdatePartyRequest,
} from "@ardenfold/contracts";
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
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

import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentOrganization } from "../auth/current-organization.decorator";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../auth/organization-context.types";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContractValidationPipe } from "../http/contracts";
import { PartyDetailsService } from "./party-details.service";
import { PartyManagementService } from "./party-management.service";

@ApiTags("parties")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("parties")
export class PartiesController {
    constructor(
        private readonly parties: PartyManagementService,
        private readonly details: PartyDetailsService,
    ) {}

    @Post()
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "createParty" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreatePartyRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/PartySummary" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createPartyRequestSchema)) input: CreatePartyRequest,
    ) {
        return this.parties.create(principal, org.id, input);
    }

    @Get()
    @RequirePermissions("parties.read")
    @ApiOperation({ operationId: "listParties" })
    @ApiQuery({ name: "limit", required: false, type: Number })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiQuery({ name: "status", required: false, enum: ["active", "archived"] })
    @ApiQuery({ name: "role", required: false, enum: ["customer", "provider"] })
    @ApiQuery({ name: "kind", required: false, enum: ["organization", "individual"] })
    @ApiQuery({ name: "name", required: false, type: String })
    @ApiQuery({ name: "q", required: false, type: String })
    @ApiQuery({ name: "sort", required: false, enum: ["name_asc", "name_desc", "updated_desc"] })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartyListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(partyListQuerySchema)) query: PartyListQuery,
    ) {
        return this.parties.list(principal, org.id, query);
    }

    @Get(":partyId")
    @RequirePermissions("parties.read")
    @ApiOperation({ operationId: "getParty" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
    ) {
        return this.parties.get(principal, org.id, partyId);
    }

    @Patch(":partyId")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "updateParty" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdatePartyRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartySummary" } })
    update(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Body(new ContractValidationPipe(updatePartyRequestSchema)) input: UpdatePartyRequest,
    ) {
        return this.parties.update(principal, org.id, partyId, input);
    }

    @Put(":partyId/roles")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "setPartyRoles" })
    @ApiBody({ schema: { $ref: "#/components/schemas/SetPartyRolesRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartySummary" } })
    setRoles(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Body(new ContractValidationPipe(setPartyRolesRequestSchema)) input: SetPartyRolesRequest,
    ) {
        return this.parties.setRoles(principal, org.id, partyId, input);
    }

    @Post(":partyId/archive")
    @RequirePermissions("parties.archive")
    @ApiOperation({ operationId: "archiveParty" })
    @ApiBody({ schema: { $ref: "#/components/schemas/PartyVersionRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartySummary" } })
    archive(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Body(new ContractValidationPipe(partyVersionRequestSchema)) input: PartyVersionRequest,
    ) {
        return this.parties.setArchived(principal, org.id, partyId, input, true);
    }

    @Post(":partyId/restore")
    @RequirePermissions("parties.archive")
    @ApiOperation({ operationId: "restoreParty" })
    @ApiBody({ schema: { $ref: "#/components/schemas/PartyVersionRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartySummary" } })
    restore(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Body(new ContractValidationPipe(partyVersionRequestSchema)) input: PartyVersionRequest,
    ) {
        return this.parties.setArchived(principal, org.id, partyId, input, false);
    }

    @Post(":partyId/identifiers")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "addPartyIdentifier" })
    @ApiBody({ schema: { $ref: "#/components/schemas/AddPartyIdentifierRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    addIdentifier(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Body(new ContractValidationPipe(addPartyIdentifierRequestSchema))
        input: AddPartyIdentifierRequest,
    ) {
        return this.details.addIdentifier(principal, org.id, partyId, input);
    }

    @Delete(":partyId/identifiers/:identifierId")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "removePartyIdentifier" })
    @ApiBody({ schema: { $ref: "#/components/schemas/PartyVersionRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    removeIdentifier(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Param("identifierId", new ContractValidationPipe(identifierSchema)) identifierId: string,
        @Body(new ContractValidationPipe(partyVersionRequestSchema)) input: PartyVersionRequest,
    ) {
        return this.details.removeIdentifier(principal, org.id, partyId, identifierId, input);
    }

    @Post(":partyId/contacts")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "addPartyContact" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreatePartyContactRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    addContact(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Body(new ContractValidationPipe(createPartyContactRequestSchema))
        input: CreatePartyContactRequest,
    ) {
        return this.details.addContact(principal, org.id, partyId, input);
    }

    @Patch(":partyId/contacts/:contactId")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "updatePartyContact" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdatePartyContactRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    updateContact(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Param("contactId", new ContractValidationPipe(identifierSchema)) contactId: string,
        @Body(new ContractValidationPipe(updatePartyContactRequestSchema))
        input: UpdatePartyContactRequest,
    ) {
        return this.details.updateContact(principal, org.id, partyId, contactId, input);
    }

    @Delete(":partyId/contacts/:contactId")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "removePartyContact" })
    @ApiBody({ schema: { $ref: "#/components/schemas/PartyVersionRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    removeContact(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Param("contactId", new ContractValidationPipe(identifierSchema)) contactId: string,
        @Body(new ContractValidationPipe(partyVersionRequestSchema)) input: PartyVersionRequest,
    ) {
        return this.details.removeContact(principal, org.id, partyId, contactId, input);
    }

    @Post(":partyId/contacts/:contactId/channels")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "addPartyContactChannel" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreatePartyContactChannelRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    addChannel(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Param("contactId", new ContractValidationPipe(identifierSchema)) contactId: string,
        @Body(new ContractValidationPipe(createPartyContactChannelRequestSchema))
        input: CreatePartyContactChannelRequest,
    ) {
        return this.details.addChannel(principal, org.id, partyId, contactId, input);
    }

    @Patch(":partyId/contacts/:contactId/channels/:channelId")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "updatePartyContactChannel" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdatePartyContactChannelRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    updateChannel(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Param("contactId", new ContractValidationPipe(identifierSchema)) contactId: string,
        @Param("channelId", new ContractValidationPipe(identifierSchema)) channelId: string,
        @Body(new ContractValidationPipe(updatePartyContactChannelRequestSchema))
        input: UpdatePartyContactChannelRequest,
    ) {
        return this.details.updateChannel(principal, org.id, partyId, contactId, channelId, input);
    }

    @Delete(":partyId/contacts/:contactId/channels/:channelId")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "removePartyContactChannel" })
    @ApiBody({ schema: { $ref: "#/components/schemas/PartyVersionRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    removeChannel(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Param("contactId", new ContractValidationPipe(identifierSchema)) contactId: string,
        @Param("channelId", new ContractValidationPipe(identifierSchema)) channelId: string,
        @Body(new ContractValidationPipe(partyVersionRequestSchema)) input: PartyVersionRequest,
    ) {
        return this.details.removeChannel(principal, org.id, partyId, contactId, channelId, input);
    }

    @Post(":partyId/addresses")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "addPartyAddress" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreatePartyAddressRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    addAddress(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Body(new ContractValidationPipe(createPartyAddressRequestSchema))
        input: CreatePartyAddressRequest,
    ) {
        return this.details.addAddress(principal, org.id, partyId, input);
    }

    @Patch(":partyId/addresses/:addressId")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "updatePartyAddress" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdatePartyAddressRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    updateAddress(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Param("addressId", new ContractValidationPipe(identifierSchema)) addressId: string,
        @Body(new ContractValidationPipe(updatePartyAddressRequestSchema))
        input: UpdatePartyAddressRequest,
    ) {
        return this.details.updateAddress(principal, org.id, partyId, addressId, input);
    }

    @Delete(":partyId/addresses/:addressId")
    @RequirePermissions("parties.write")
    @ApiOperation({ operationId: "removePartyAddress" })
    @ApiBody({ schema: { $ref: "#/components/schemas/PartyVersionRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/PartyDetail" } })
    removeAddress(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("partyId", new ContractValidationPipe(identifierSchema)) partyId: string,
        @Param("addressId", new ContractValidationPipe(identifierSchema)) addressId: string,
        @Body(new ContractValidationPipe(partyVersionRequestSchema)) input: PartyVersionRequest,
    ) {
        return this.details.removeAddress(principal, org.id, partyId, addressId, input);
    }
}
