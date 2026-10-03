import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { TechnicalEvidenceService } from "./evidence/management/technical-evidence.service";
import { ExecutionStartService } from "./executions/management/execution-start.service";
import { ExecutionQueriesService } from "./executions/queries/execution-queries.service";
import { ExecutionLifecycleService } from "./executions/revisions/execution-lifecycle.service";
import { TechnicalEvidenceController } from "./http/evidence.controller";
import { TechnicalExecutionsController } from "./http/executions.controller";
import { TechnicalResultsController } from "./http/results.controller";
import { TechnicalResultsService } from "./results/management/technical-results.service";

@Module({
    imports: [AuthModule, FilesModule],
    controllers: [
        TechnicalExecutionsController,
        TechnicalResultsController,
        TechnicalEvidenceController,
    ],
    providers: [
        ExecutionStartService,
        ExecutionQueriesService,
        ExecutionLifecycleService,
        TechnicalResultsService,
        TechnicalEvidenceService,
    ],
})
export class TechnicalOperationsModule {}
