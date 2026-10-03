import { Module } from "@nestjs/common";

import { TechnicalApprovalService } from "./approvals/technical-approval.service";
import { TechnicalPackageService } from "./approvals/technical-package.service";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { TechnicalEvidenceService } from "./evidence/management/technical-evidence.service";
import { ExecutionStartService } from "./executions/management/execution-start.service";
import { ExecutionQueriesService } from "./executions/queries/execution-queries.service";
import { ExecutionLifecycleService } from "./executions/revisions/execution-lifecycle.service";
import { TechnicalEvidenceController } from "./http/evidence.controller";
import { TechnicalDecisionPolicyController } from "./http/decision-policy.controller";
import {
    TechnicalDecisionsController,
    TechnicalPackagesController,
} from "./http/decisions.controller";
import { TechnicalExecutionsController } from "./http/executions.controller";
import { TechnicalResultsController } from "./http/results.controller";
import { TechnicalResultsService } from "./results/management/technical-results.service";
import { TechnicalDecisionPolicyService } from "./reviews/decision-policy.service";
import { TechnicalReviewService } from "./reviews/technical-review.service";

@Module({
    imports: [AuthModule, FilesModule],
    controllers: [
        TechnicalExecutionsController,
        TechnicalResultsController,
        TechnicalEvidenceController,
        TechnicalDecisionPolicyController,
        TechnicalDecisionsController,
        TechnicalPackagesController,
    ],
    providers: [
        ExecutionStartService,
        ExecutionQueriesService,
        ExecutionLifecycleService,
        TechnicalResultsService,
        TechnicalEvidenceService,
        TechnicalDecisionPolicyService,
        TechnicalReviewService,
        TechnicalApprovalService,
        TechnicalPackageService,
    ],
})
export class TechnicalOperationsModule {}
