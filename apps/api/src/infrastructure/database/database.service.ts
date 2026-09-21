import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    createDatabaseConnection,
    type ArdenfoldDatabase,
    type DatabaseConnection,
} from "@ardenfold/database";

import type { EnvironmentVariables } from "../../config/environment";

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
    private readonly connection: DatabaseConnection;

    constructor(configService: ConfigService<EnvironmentVariables, true>) {
        this.connection = createDatabaseConnection({
            connectionString: configService.get("DATABASE_URL", {
                infer: true,
            }),
            max: configService.get("DATABASE_POOL_MAX", {
                infer: true,
            }),
            idleTimeoutMillis: configService.get("DATABASE_IDLE_TIMEOUT_MS", {
                infer: true,
            }),
            connectionTimeoutMillis: configService.get("DATABASE_CONNECTION_TIMEOUT_MS", {
                infer: true,
            }),
            applicationName: "ardenfold-api",
            ssl: configService.get("DATABASE_SSL", {
                infer: true,
            }),
        });
    }

    get database(): ArdenfoldDatabase {
        return this.connection.database;
    }

    async onApplicationShutdown(): Promise<void> {
        await this.connection.close();
    }

    async ping(): Promise<void> {
        await this.connection.ping();
    }
}
