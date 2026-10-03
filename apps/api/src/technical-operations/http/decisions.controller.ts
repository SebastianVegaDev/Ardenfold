import {
    decideTechnicalApprovalSchema,
    decideTechnicalReviewSchema,
    identifierSchema,
    type DecideTechnicalApproval,
    type DecideTechnicalReview,
} from "@ardenfold/contracts";
import { Body, Controller, Get, Post, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentPrincipal } from "../../auth/authentication/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { RequirePermissions } from "../../auth/authorization/require-permissions.decorator";
import { CurrentOrganization } from "../../auth/organization-context/current-organization.decorator";
import {
    organizationHeader,
    type ActiveOrganizationContext,
} from "../../auth/organization-context/organization-context.types";
import { ContractValidationPipe } from "../../http/contracts";
import { TechnicalApprovalService } from "../approvals/technical-approval.service";
import { TechnicalPackageService } from "../approvals/technical-package.service";
import { TechnicalReviewService } from "../reviews/technical-review.service";

@ApiTags("technical-operations-decisions")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("technical-executions/:executionId/revisions/:revisionId")
export class TechnicalDecisionsController {
    constructor(
        private readonly reviews: TechnicalReviewService,
        private readonly approvals: TechnicalApprovalService,
        private readonly packages: TechnicalPackageService,
    ) {}

    @Get("review-package")
    @RequirePermissions("technical_executions.read", "technical_evidence.read")
    @ApiOperation({ operationId: "getTechnicalReviewPackage" })
    reviewPackage(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
    ) {
        return this.packages.reviewPackage(principal, org.id, executionId, revisionId);
    }

    @Post("review")
    @RequirePermissions("technical_reviews.decide")
    @ApiOperation({ operationId: "decideTechnicalReview" })
    @ApiBody({ schema: { $ref: "#/components/schemas/DecideTechnicalReview" } })
    review(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(decideTechnicalReviewSchema)) input: DecideTechnicalReview,
    ) {
        return this.reviews.decide(principal, org.id, executionId, revisionId, input);
    }

    @Post("approval")
    @RequirePermissions("technical_approvals.decide")
    @ApiOperation({ operationId: "decideTechnicalApproval" })
    @ApiBody({ schema: { $ref: "#/components/schemas/DecideTechnicalApproval" } })
    approval(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("executionId", new ContractValidationPipe(identifierSchema)) executionId: string,
        @Param("revisionId", new ContractValidationPipe(identifierSchema)) revisionId: string,
        @Body(new ContractValidationPipe(decideTechnicalApprovalSchema))
        input: DecideTechnicalApproval,
    ) {
        return this.approvals.decide(principal, org.id, executionId, revisionId, input);
    }
}

@ApiTags("technical-operations-decisions")
@ApiBearerAuth()
@ApiHeader({ name: organizationHeader, required: true })
@Controller("technical-approvals")
export class TechnicalPackagesController {
    constructor(private readonly packages: TechnicalPackageService) {}

    @Get(":approvalId/package")
    @RequirePermissions("technical_executions.read", "technical_evidence.read")
    @ApiOperation({ operationId: "getApprovedTechnicalPackage" })
    approved(
        @CurrentPrincipal() principal: AuthenticatedPrincipal,
        @CurrentOrganization() org: ActiveOrganizationContext,
        @Param("approvalId", new ContractValidationPipe(identifierSchema)) approvalId: string,
    ) {
        return this.packages.approvedPackage(principal, org.id, approvalId);
    }
}
