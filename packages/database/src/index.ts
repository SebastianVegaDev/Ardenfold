import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type ArdenfoldDatabase = NodePgDatabase<typeof schema>;

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
    ping: () => Promise<void>;
    close: () => Promise<void>;
}>;

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

        async ping(): Promise<void> {
            await database.execute(sql`SELECT 1`);
        },

        async close(): Promise<void> {
            await pool.end();
        },
    };
}
