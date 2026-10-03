import {
    createTechnicalEvidenceSchema,
    identifierSchema,
    removeTechnicalEvidenceSchema,
    updateTechnicalEvidenceSchema,
    type CreateTechnicalEvidence,
    type RemoveTechnicalEvidence,
    type UpdateTechnicalEvidence,
} from "@ardenfold/contracts";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Res } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiBody,
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
import { ContractValidationPipe } from "../../http/contracts";
import { TechnicalEvidenceService } from "../evidence/management/technical-evidence.service";

@ApiTags("technical-operations-evidence")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("technical-executions/:executionId/revisions/:revisionId/evidence")
export class TechnicalEvidenceController {
    constructor(private readonly evidence: TechnicalEvidenceService) {}

    @Get()
    @RequirePermissions("technical_evidence.read")
    @ApiOperation({ operationId: "listTechnicalEvidence" })
    list(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
    ) {
        return this.evidence.list(principal, org.id, executionId, revisionId);
    }

    @Post()
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "createTechnicalEvidence" })
    @ApiBody({ schema: { $ref: "#/components/schemas/CreateTechnicalEvidence" } })
    create(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(createTechnicalEvidenceSchema))
        input: CreateTechnicalEvidence,
    ) {
        return this.evidence.create(principal, org.id, executionId, revisionId, input);
    }

    @Patch(":evidenceId")
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "updateTechnicalEvidence" })
    @ApiBody({ schema: { $ref: "#/components/schemas/UpdateTechnicalEvidence" } })
    update(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Param("evidenceId", new ContractValidationPipe(identifierSchema)) evidenceId: string,
        @Body(new ContractValidationPipe(updateTechnicalEvidenceSchema))
        input: UpdateTechnicalEvidence,
    ) {
        return this.evidence.update(principal, org.id, executionId, revisionId, evidenceId, input);
    }

    @Post(":evidenceId/remove")
    @HttpCode(200)
    @RequirePermissions("technical_executions.write")
    @ApiOperation({ operationId: "removeTechnicalEvidence" })
    @ApiBody({ schema: { $ref: "#/components/schemas/RemoveTechnicalEvidence" } })
    remove(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Param("evidenceId", new ContractValidationPipe(identifierSchema)) evidenceId: string,
        @Body(new ContractValidationPipe(removeTechnicalEvidenceSchema))
        input: RemoveTechnicalEvidence,
    ) {
        return this.evidence.remove(principal, org.id, executionId, revisionId, evidenceId, input);
    }

    @Get(":evidenceId/content")
    @RequirePermissions("technical_evidence.read", "files.read")
    @ApiOperation({ operationId: "downloadTechnicalEvidence" })
    @ApiOkResponse({
        content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
    })
    async download(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Param("evidenceId", new ContractValidationPipe(identifierSchema)) evidenceId: string,
        @Res() reply: FastifyReply,
    ) {
        const object = await this.evidence.download(
            principal,
            org.id,
            executionId,
            revisionId,
            evidenceId,
        );
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
