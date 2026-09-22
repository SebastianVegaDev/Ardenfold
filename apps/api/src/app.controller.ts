import {
    livenessResponseSchema,
    readinessResponseSchema,
    type LivenessResponse,
    type ReadinessResponse,
} from "@ardenfold/contracts";

import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { DatabaseService } from "./infrastructure/database/database.service";
import { Public } from "./auth/public.decorator";

@ApiTags("operations")
@Public()
@Controller()
export class AppController {
    constructor(
        @Inject(DatabaseService)
        private readonly databaseService: DatabaseService,
    ) {}

    @Get("health/live")
    @ApiOperation({
        operationId: "getLiveness",
    })
    @ApiOkResponse({
        schema: {
            $ref: "#/components/schemas/LivenessResponse",
        },
    })
    getLiveness(): LivenessResponse {
        return livenessResponseSchema.parse({
            status: "ok",
            service: "api",
        });
    }

    @Get("health/ready")
    @ApiOperation({
        operationId: "getReadiness",
    })
    @ApiOkResponse({
        schema: {
            $ref: "#/components/schemas/ReadinessResponse",
        },
    })
    async getReadiness(): Promise<ReadinessResponse> {
        await this.databaseService.ping();

        return readinessResponseSchema.parse({
            status: "ok",
            service: "api",
            database: "up",
        });
    }
}
