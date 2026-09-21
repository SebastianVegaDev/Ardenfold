import "./load-environment";

import { createDatabaseConnection, type DatabaseConnection } from "../index";

function requireEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (value === undefined || value.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

function readDatabaseSsl(): boolean {
    const value = process.env.DATABASE_SSL ?? "false";

    if (value !== "true" && value !== "false") {
        throw new Error('DATABASE_SSL must contain either "true" or "false".');
    }

    return value === "true";
}

export function createCliDatabaseConnection(applicationName: string): DatabaseConnection {
    return createDatabaseConnection({
        connectionString: requireEnvironmentVariable("DATABASE_URL"),
        max: 1,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 5_000,
        ssl: readDatabaseSsl(),
        applicationName,
    });
}
