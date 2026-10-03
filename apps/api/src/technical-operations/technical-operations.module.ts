import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ExecutionStartService } from "./executions/management/execution-start.service";
import { ExecutionQueriesService } from "./executions/queries/execution-queries.service";
import { ExecutionLifecycleService } from "./executions/revisions/execution-lifecycle.service";
import { TechnicalExecutionsController } from "./http/executions.controller";

@Module({
    imports: [AuthModule],
    controllers: [TechnicalExecutionsController],
    providers: [ExecutionStartService, ExecutionQueriesService, ExecutionLifecycleService],
})
export class TechnicalOperationsModule {}
