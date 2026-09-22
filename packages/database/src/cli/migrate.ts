import { resolve } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createCliDatabaseConnection } from "./create-cli-connection";

async function run(): Promise<void> {
    const connection = createCliDatabaseConnection(
        "ardenfold-database-migrator",
        "DATABASE_MIGRATION_URL",
    );

    try {
        await migrate(connection.database, {
            migrationsFolder: resolve(process.cwd(), "drizzle"),
        });

        console.log("Database migrations applied successfully.");
    } finally {
        await connection.close();
    }
}

run().catch((error: unknown) => {
    console.error("Database migration failed.", error);
    process.exitCode = 1;
});
