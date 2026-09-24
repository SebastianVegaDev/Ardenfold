import {
    commitRegistryImportRequestSchema,
    identifierSchema,
    previewRegistryImportRequestSchema,
    registryImportKindSchema,
    type CommitRegistryImportRequest,
    type PreviewRegistryImportRequest,
} from "@ardenfold/contracts";
import { Body, Controller, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiBody,
    ApiCreatedResponse,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from "@nestjs/swagger";
import type { FastifyReply } from "fastify";

import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentOrganization } from "../auth/current-organization.decorator";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { organizationHeader, type ActiveOrganizationContext } from "../auth/organization-context.types";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContractValidationPipe } from "../http/contracts";
import { csvTemplate } from "./import-parser";
import { RegistryImportService } from "./registry-import.service";

@ApiTags("registry imports")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@RequirePermissions()
@Controller("registry/imports")
export class RegistryImportsController {
    constructor(private readonly imports: RegistryImportService) {}

    @Get("templates/:kind")
    @ApiOperation({ operationId: "downloadRegistryImportTemplate" })
    async template(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("kind", new ContractValidationPipe(registryImportKindSchema)) kind: "party" | "asset",
        @Res({ passthrough: true }) reply: FastifyReply,
    ) {
        await this.imports.assertPermission(principal, organization.id, kind);
        reply.type("text/csv; charset=utf-8");
        reply.header("content-disposition", `attachment; filename="ardenfold-${kind}-v1.csv"`);
        reply.header("cache-control", "no-store");
        return csvTemplate(kind);
    }

    @Post("preview")
    @ApiOperation({ operationId: "previewRegistryImport" })
    @ApiBody({ schema: { $ref: "#/components/schemas/PreviewRegistryImportRequest" } })
    @ApiCreatedResponse({ schema: { $ref: "#/components/schemas/RegistryImportSessionResponse" } })
    preview(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Body(new ContractValidationPipe(previewRegistryImportRequestSchema)) input: PreviewRegistryImportRequest,
    ) {
        return this.imports.preview(principal, organization.id, input);
    }

    @Get(":sessionId/errors.csv")
    @ApiOperation({ operationId: "downloadRegistryImportErrors" })
    async errors(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("sessionId", new ContractValidationPipe(identifierSchema)) sessionId: string,
        @Res({ passthrough: true }) reply: FastifyReply,
    ) {
        const csv = await this.imports.errorsCsv(principal, organization.id, sessionId);
        reply.type("text/csv; charset=utf-8");
        reply.header("content-disposition", `attachment; filename="ardenfold-import-${sessionId}-errors.csv"`);
        reply.header("cache-control", "no-store");
        return csv;
    }

    @Get(":sessionId")
    @ApiOperation({ operationId: "getRegistryImport" })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/RegistryImportSessionResponse" } })
    get(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("sessionId", new ContractValidationPipe(identifierSchema)) sessionId: string,
    ) {
        return this.imports.get(principal, organization.id, sessionId);
    }

    @Post(":sessionId/commit")
    @HttpCode(200)
    @ApiOperation({ operationId: "commitRegistryImport" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CommitRegistryImportRequest" } })
    @ApiOkResponse({ schema: { $ref: "#/components/schemas/RegistryImportSessionResponse" } })
    commit(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() organization: ActiveOrganizationContext,
        @Param("sessionId", new ContractValidationPipe(identifierSchema)) sessionId: string,
        @Body(new ContractValidationPipe(commitRegistryImportRequestSchema)) input: CommitRegistryImportRequest,
    ) {
        return this.imports.commit(principal, organization.id, sessionId, input);
    }
}
