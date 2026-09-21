import {
    Injectable,
    type OnApplicationBootstrap,
    type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

import type { EnvironmentVariables } from "../../config/environment";

@Injectable()
export class DatabaseService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly pool: Pool;

    constructor(configService: ConfigService<EnvironmentVariables, true>) {
        const databaseSsl = configService.get("DATABASE_SSL", {
            infer: true,
        });

        this.pool = new Pool({
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
            application_name: "ardenfold-api",
            ssl: databaseSsl
                ? {
                      rejectUnauthorized: true,
                  }
                : false,
        });
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.ping();
    }

    async onApplicationShutdown(): Promise<void> {
        await this.pool.end();
    }

    async ping(): Promise<void> {
        await this.pool.query("SELECT 1");
    }
}
