import "./src/cli/load-environment";

import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required to execute Drizzle Kit commands.");
}

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/schema/index.ts",
    out: "./drizzle",
    dbCredentials: {
        url: databaseUrl,
    },
    strict: true,
    verbose: true,
});
