import {
    assetHistoryQuerySchema,
    correctAssetRelationshipRequestSchema,
    endAssetRelationshipRequestSchema,
    startAssetRelationshipRequestSchema,
    type AssetHistoryQuery,
    type CorrectAssetRelationshipRequest,
    type EndAssetRelationshipRequest,
    type StartAssetRelationshipRequest,
    addAssetIdentifierRequestSchema,
    assetListQuerySchema,
    assetVersionRequestSchema,
    changeAssetIdentifierRequestSchema,
    createAssetRequestSchema,
    identifierSchema,
    setAssetLifecycleRequestSchema,
    updateAssetRequestSchema,
    type AddAssetIdentifierRequest,
    type AssetListQuery,
    type AssetVersionRequest,
    type ChangeAssetIdentifierRequest,
    type CreateAssetRequest,
    type SetAssetLifecycleRequest,
    type UpdateAssetRequest,
} from "@ardenfold/contracts";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
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

import type { AuthenticatedPrincipal } from "../../auth/auth.types";
import { CurrentOrganization } from "../../auth/current-organization.decorator";
import { CurrentPrincipal } from "../../auth/current-principal.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../../auth/organization-context.types";
import { RequirePermissions } from "../../auth/require-permissions.decorator";
import { ContractValidationPipe } from "../../http/contracts";
import { AssetManagementService } from "../management/asset-management.service";
import { AssetRelationshipsService } from "../relationships/asset-relationships.service";

@ApiTags("assets")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("assets")
export class AssetsController {
    constructor(
        private readonly assets: AssetManagementService,
        private readonly relationships: AssetRelationshipsService,
    ) {}

    @Post()
    @RequirePermissions("assets.write")
    @ApiOperation({ operationId: "createAsset" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreateAssetRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/AssetDetail" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(createAssetRequestSchema)) input: CreateAssetRequest,
    ) {
        return this.assets.create(principal, org.id, input);
    }

    @Get()
    @RequirePermissions("assets.read")
    @ApiOperation({ operationId: "listAssets" })
    @ApiQuery({ name: "limit", required: false, type: Number })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiQuery({ name: "name", required: false, type: String })
    @ApiQuery({ name: "manufacturer", required: false, type: String })
    @ApiQuery({ name: "model", required: false, type: String })
    @ApiQuery({ name: "classification", required: false, type: String })
    @ApiQuery({ name: "q", required: false, type: String })
    @ApiQuery({ name: "sort", required: false, enum: ["name_asc", "name_desc", "updated_desc"] })
    @ApiQuery({ name: "status", required: false, enum: ["active", "archived"] })
    @ApiQuery({
        name: "lifecycle",
        required: false,
        enum: ["registered", "in_service", "out_of_service", "retired"],
    })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetListResponse" } })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Query(new ContractValidationPipe(assetListQuerySchema)) query: AssetListQuery,
    ) {
        return this.assets.list(principal, org.id, query);
    }

    @Get(":assetId")
    @RequirePermissions("assets.read")
    @ApiOperation({ operationId: "getAsset" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetDetail" } })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
    ) {
        return this.assets.get(principal, org.id, assetId);
    }

    @Get(":assetId/relationships/current")
    @RequirePermissions("assets.read")
    @ApiOperation({ operationId: "getAssetCurrentRelationships" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetCurrentRelationships" } })
    currentRelationships(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
    ) {
        return this.relationships.current(principal, org.id, assetId);
    }

    @Get(":assetId/relationships/history")
    @RequirePermissions("assets.read")
    @ApiOperation({ operationId: "listAssetRelationshipHistory" })
    @ApiQuery({ name: "limit", required: false, type: Number })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetRelationshipHistoryResponse" } })
    relationshipHistory(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Query(new ContractValidationPipe(assetHistoryQuerySchema)) query: AssetHistoryQuery,
    ) {
        return this.relationships.relationshipHistory(principal, org.id, assetId, query);
    }

    @Get(":assetId/history")
    @RequirePermissions("assets.read")
    @ApiOperation({ operationId: "listAssetBusinessHistory" })
    @ApiQuery({ name: "limit", required: false, type: Number })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetHistoryResponse" } })
    businessHistory(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Query(new ContractValidationPipe(assetHistoryQuerySchema)) query: AssetHistoryQuery,
    ) {
        return this.relationships.businessHistory(principal, org.id, assetId, query);
    }

    @Post(":assetId/relationships/start")
    @RequirePermissions("assets.manage_relationships")
    @ApiOperation({ operationId: "startAssetRelationship" })
    @ApiBody({ schema: { $ref: "#/components/schemas/StartAssetRelationshipRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/AssetCurrentRelationships" } })
    startRelationship(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Body(new ContractValidationPipe(startAssetRelationshipRequestSchema))
        input: StartAssetRelationshipRequest,
    ) {
        return this.relationships.start(principal, org.id, assetId, input);
    }

    @Post(":assetId/relationships/end")
    @RequirePermissions("assets.manage_relationships")
    @ApiOperation({ operationId: "endAssetRelationship" })
    @ApiBody({ schema: { $ref: "#/components/schemas/EndAssetRelationshipRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/AssetCurrentRelationships" } })
    endRelationship(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Body(new ContractValidationPipe(endAssetRelationshipRequestSchema))
        input: EndAssetRelationshipRequest,
    ) {
        return this.relationships.end(principal, org.id, assetId, input);
    }

    @Post(":assetId/relationships/correct")
    @RequirePermissions("assets.manage_relationships")
    @ApiOperation({ operationId: "correctAssetRelationship" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CorrectAssetRelationshipRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/AssetCurrentRelationships" } })
    correctRelationship(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Body(new ContractValidationPipe(correctAssetRelationshipRequestSchema))
        input: CorrectAssetRelationshipRequest,
    ) {
        return this.relationships.correct(principal, org.id, assetId, input);
    }

    @Patch(":assetId")
    @RequirePermissions("assets.write")
    @ApiOperation({ operationId: "updateAsset" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdateAssetRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetDetail" } })
    update(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Body(new ContractValidationPipe(updateAssetRequestSchema)) input: UpdateAssetRequest,
    ) {
        return this.assets.update(principal, org.id, assetId, input);
    }

    @Post(":assetId/lifecycle")
    @RequirePermissions("assets.write")
    @ApiOperation({ operationId: "setAssetLifecycle" })
    @ApiBody({ schema: { $ref: "#/components/schemas/SetAssetLifecycleRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetDetail" } })
    setLifecycle(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Body(new ContractValidationPipe(setAssetLifecycleRequestSchema))
        input: SetAssetLifecycleRequest,
    ) {
        return this.assets.setLifecycle(principal, org.id, assetId, input);
    }

    @Post(":assetId/archive")
    @RequirePermissions("assets.archive")
    @ApiOperation({ operationId: "archiveAsset" })
    @ApiBody({ schema: { $ref: "#/components/schemas/AssetVersionRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetDetail" } })
    archive(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Body(new ContractValidationPipe(assetVersionRequestSchema)) input: AssetVersionRequest,
    ) {
        return this.assets.setArchived(principal, org.id, assetId, input, true);
    }

    @Post(":assetId/restore")
    @RequirePermissions("assets.archive")
    @ApiOperation({ operationId: "restoreAsset" })
    @ApiBody({ schema: { $ref: "#/components/schemas/AssetVersionRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetDetail" } })
    restore(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Body(new ContractValidationPipe(assetVersionRequestSchema)) input: AssetVersionRequest,
    ) {
        return this.assets.setArchived(principal, org.id, assetId, input, false);
    }

    @Post(":assetId/identifiers")
    @RequirePermissions("assets.write")
    @ApiOperation({ operationId: "addAssetIdentifier" })
    @ApiBody({ schema: { $ref: "#/components/schemas/AddAssetIdentifierRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/AssetDetail" } })
    addIdentifier(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Body(new ContractValidationPipe(addAssetIdentifierRequestSchema))
        input: AddAssetIdentifierRequest,
    ) {
        return this.assets.addIdentifier(principal, org.id, assetId, input);
    }

    @Patch(":assetId/identifiers/:identifierId")
    @RequirePermissions("assets.write")
    @ApiOperation({ operationId: "changeAssetIdentifier" })
    @ApiBody({ schema: { $ref: "#/components/schemas/ChangeAssetIdentifierRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetDetail" } })
    changeIdentifier(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Param("identifierId", new ContractValidationPipe(identifierSchema)) identifierId: string,
        @Body(new ContractValidationPipe(changeAssetIdentifierRequestSchema))
        input: ChangeAssetIdentifierRequest,
    ) {
        return this.assets.changeIdentifier(principal, org.id, assetId, identifierId, input);
    }

    @Delete(":assetId/identifiers/:identifierId")
    @RequirePermissions("assets.write")
    @ApiOperation({ operationId: "retireAssetIdentifier" })
    @ApiBody({ schema: { $ref: "#/components/schemas/AssetVersionRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/AssetDetail" } })
    retireIdentifier(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("assetId", new ContractValidationPipe(identifierSchema)) assetId: string,
        @Param("identifierId", new ContractValidationPipe(identifierSchema)) identifierId: string,
        @Body(new ContractValidationPipe(assetVersionRequestSchema)) input: AssetVersionRequest,
    ) {
        return this.assets.retireIdentifier(principal, org.id, assetId, identifierId, input);
    }
}
