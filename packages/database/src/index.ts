import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type ArdenfoldDatabase = NodePgDatabase<typeof schema>;
export type ArdenfoldTransaction = Parameters<Parameters<ArdenfoldDatabase["transaction"]>[0]>[0];

export type TenantContext = Readonly<{
    organizationId: string;
    userId: string;
}>;

export type DatabaseConnectionOptions = Readonly<{
    connectionString: string;
    max: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
    ssl: boolean;
    applicationName: string;
}>;

export type DatabaseConnection = Readonly<{
    database: ArdenfoldDatabase;
    withTenantTransaction: <Result>(
        context: TenantContext,
        operation: (transaction: ArdenfoldTransaction) => Promise<Result>,
    ) => Promise<Result>;
    ping: () => Promise<void>;
    close: () => Promise<void>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function validateTenantContext(context: TenantContext): void {
    if (!UUID_PATTERN.test(context.organizationId)) {
        throw new Error("Tenant context organizationId must be a valid UUID.");
    }

    if (!UUID_PATTERN.test(context.userId)) {
        throw new Error("Tenant context userId must be a valid UUID.");
    }
}

export function createDatabaseConnection(options: DatabaseConnectionOptions): DatabaseConnection {
    const pool = new Pool({
        connectionString: options.connectionString,
        max: options.max,
        idleTimeoutMillis: options.idleTimeoutMillis,
        connectionTimeoutMillis: options.connectionTimeoutMillis,
        application_name: options.applicationName,
        ssl: options.ssl
            ? {
                  rejectUnauthorized: true,
              }
            : false,
    });

    const database = drizzle(pool, {
        schema,
    });

    return {
        database,

        async withTenantTransaction<Result>(
            context: TenantContext,
            operation: (transaction: ArdenfoldTransaction) => Promise<Result>,
        ): Promise<Result> {
            validateTenantContext(context);

            return database.transaction(async (transaction) => {
                await transaction.execute(sql`
                    SELECT
                        set_config('ardenfold.organization_id', ${context.organizationId}, true),
                        set_config('ardenfold.user_id', ${context.userId}, true)
                `);

                return operation(transaction);
            });
        },

        async ping(): Promise<void> {
            await database.execute(sql`SELECT 1`);
        },

        async close(): Promise<void> {
            await pool.end();
        },
    };
}
