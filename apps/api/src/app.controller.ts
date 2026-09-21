import { Controller, Get } from "@nestjs/common";

import { DatabaseService } from "./infrastructure/database/database.service";

type HealthResponse = Readonly<{
    status: "ok";
    service: "api";
    database: "up";
}>;

@Controller()
export class AppController {
    constructor(private readonly databaseService: DatabaseService) {}

    @Get("health")
    async getHealth(): Promise<HealthResponse> {
        await this.databaseService.ping();

        return {
            status: "ok",
            service: "api",
            database: "up",
        };
    }
}
