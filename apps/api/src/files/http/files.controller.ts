import {
    identifierSchema,
    requestFileUploadSchema,
    type RequestFileUpload,
} from "@ardenfold/contracts";
import { Body, Controller, Get, HttpCode, Param, Post, Put, Res } from "@nestjs/common";
import { RouteConfig } from "@nestjs/platform-fastify";
import {
    ApiBearerAuth,
    ApiBody,
    ApiCreatedResponse,
    ApiConsumes,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from "@nestjs/swagger";
import type { FastifyReply } from "fastify";

import { CurrentPrincipal } from "../../auth/authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { RequirePermissions } from "../../auth/authorization/require-permissions.decorator";
import { CurrentOrganization } from "../../auth/organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../../auth/organization-context/organization-context.types";
import { ContractException, ContractValidationPipe } from "../../http/contracts";
import { FileUploadsService } from "../uploads/file-uploads.service";

@ApiTags("files")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("files")
export class FilesController {
    constructor(private readonly uploads: FileUploadsService) {}

    @Post()
    @RequirePermissions("files.upload")
    @ApiOperation({ operationId: "requestFileUpload" })
    @ApiBody({ schema: { $ref: "#/components/schemas/RequestFileUpload" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/StoredObject" } })
    reserve(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(requestFileUploadSchema)) input: RequestFileUpload,
    ) {
        return this.uploads.reserve(principal, org.id, input);
    }

    @Put(":id/content")
    @RouteConfig({ bodyLimit: 10_485_760 })
    @HttpCode(200)
    @RequirePermissions("files.upload")
    @ApiOperation({ operationId: "uploadFileContent" })
    @ApiConsumes("application/octet-stream")
    @ApiBody({ schema: { type: "string", format: "binary" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/StoredObject" } })
    upload(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("id", new ContractValidationPipe(identifierSchema)) id: string,
        @Body() body: unknown,
    ) {
        if (!Buffer.isBuffer(body)) throw new ContractException("UNSUPPORTED_MEDIA_TYPE", 415);
        return this.uploads.upload(principal, org.id, id, body);
    }

    @Post(":id/finalize")
    @HttpCode(200)
    @RequirePermissions("files.upload")
    @ApiOperation({ operationId: "finalizeFileUpload" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/StoredObject" } })
    finalize(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("id", new ContractValidationPipe(identifierSchema)) id: string,
    ) {
        return this.uploads.finalize(principal, org.id, id);
    }

    @Get(":id/content")
    @RequirePermissions("files.read")
    @ApiOperation({ operationId: "downloadUnclaimedFile" })
    @ApiOkResponse({
        content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
    })
    async download(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("id", new ContractValidationPipe(identifierSchema)) id: string,
        @Res() reply: FastifyReply,
    ) {
        const object = await this.uploads.download(principal, org.id, id);
        const filename = encodeURIComponent(object.filename).replace(
            /['()*]/gu,
            (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
        );
        return reply
            .header("Content-Type", "application/octet-stream")
            .header("X-Content-Type-Options", "nosniff")
            .header("Content-Disposition", `attachment; filename*=UTF-8''${filename}`)
            .header("Cache-Control", "private, no-store")
            .send(object.bytes);
    }
}
