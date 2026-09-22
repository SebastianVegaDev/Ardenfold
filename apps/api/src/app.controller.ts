import { healthResponseSchema, type HealthResponse } from "@ardenfold/contracts";

import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { DatabaseService } from "./infrastructure/database/database.service";

@ApiTags("operations")
@Controller()
export class AppController {
    constructor(
        @Inject(DatabaseService)
        private readonly databaseService: DatabaseService,
    ) {}

    @Get("health")
    @ApiOperation({
        operationId: "getHealth",
    })
    @ApiOkResponse({
        schema: {
            $ref: "#/components/schemas/HealthResponse",
        },
    })
    async getHealth(): Promise<HealthResponse> {
        await this.databaseService.ping();

        return healthResponseSchema.parse({
            status: "ok",
            service: "api",
            database: "up",
        });
    }
}
