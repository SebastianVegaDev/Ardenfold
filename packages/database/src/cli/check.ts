import { createCliDatabaseConnection } from "./create-cli-connection";

async function run(): Promise<void> {
    const connection = createCliDatabaseConnection("ardenfold-database-check");

    try {
        await connection.ping();

        console.log(
            JSON.stringify({
                status: "ok",
                database: "reachable",
                driver: "drizzle",
            }),
        );
    } finally {
        await connection.close();
    }
}

run().catch((error: unknown) => {
    console.error("Database connectivity check failed.", error);
    process.exitCode = 1;
});
