import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import { Client } from "pg";

import { startMockWorkos } from "./mock-workos";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const migrationUrl =
    process.env.DATABASE_MIGRATION_URL ??
    "postgresql://ardenfold_e2e_migrator:e2e-migration-password@127.0.0.1:55432/ardenfold_e2e";
const runtimeUrl =
    process.env.DATABASE_URL ??
    "postgresql://ardenfold_e2e_runtime:e2e-runtime-password@127.0.0.1:55432/ardenfold_e2e";
const workos = {
    WORKOS_CLIENT_ID: "client_e2e",
    WORKOS_API_KEY: "sk_test_e2e_local_only",
    WORKOS_API_HOSTNAME: "127.0.0.1",
    WORKOS_API_HTTPS: "false",
    WORKOS_API_PORT: "4010",
    WORKOS_ISSUER: "http://127.0.0.1:4010/",
    WORKOS_JWKS_URL: "http://127.0.0.1:4010/sso/jwks/client_e2e",
};

function assertIsolatedDatabase(): void {
    const url = new URL(migrationUrl);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_e2e")) {
        throw new Error(
            "Platform security tests may only reset a local database whose name ends in _e2e.",
        );
    }
}

function spawnProcess(
    command: string,
    arguments_: string[],
    environment: NodeJS.ProcessEnv,
    workingDirectory = repositoryRoot,
): ChildProcess {
    const child = spawn(command, arguments_, {
        cwd: workingDirectory,
        env: { ...process.env, ...environment },
        stdio: "inherit",
    });
    child.once("exit", (code, signal) => {
        if (!shuttingDown && code !== 0) {
            console.error(`Platform child exited unexpectedly (${code ?? signal ?? "unknown"}).`);
            void shutdown(1);
        }
    });
    return child;
}

async function resetDatabase(): Promise<void> {
    assertIsolatedDatabase();
    const client = new Client({ connectionString: migrationUrl });
    await client.connect();
    try {
        await client.query(
            "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
        );
    } finally {
        await client.end();
    }
}

async function runMigrations(): Promise<void> {
    await new Promise<void>((resolvePromise, reject) => {
        const child = spawn(
            process.execPath,
            [
                resolve(import.meta.dirname, "../node_modules/tsx/dist/cli.mjs"),
                "src/cli/migrate.ts",
            ],
            {
                cwd: resolve(repositoryRoot, "packages/database"),
                env: {
                    ...process.env,
                    DATABASE_MIGRATION_URL: migrationUrl,
                    DATABASE_SSL: "false",
                },
                stdio: "inherit",
            },
        );
        child.once("error", reject);
        child.once("exit", (code) =>
            code === 0
                ? resolvePromise()
                : reject(new Error(`Database migration exited with code ${String(code)}.`)),
        );
    });
}

async function waitFor(url: string): Promise<void> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url, { redirect: "manual" });
            if (response.status < 500) return;
        } catch {
            // The process is still starting.
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    throw new Error(`Timed out waiting for ${url}.`);
}

let shuttingDown = false;
const children: ChildProcess[] = [];
let mock: Awaited<ReturnType<typeof startMockWorkos>> | undefined;

async function shutdown(exitCode: number): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) child.kill("SIGTERM");
    await mock?.close().catch(() => undefined);
    process.exit(exitCode);
}

async function main(): Promise<void> {
    await resetDatabase();
    await runMigrations();
    mock = await startMockWorkos();

    children.push(
        spawnProcess(process.execPath, [resolve(repositoryRoot, "apps/api/dist/main.js")], {
            ...workos,
            NODE_ENV: "test",
            API_PORT: "3001",
            DATABASE_URL: runtimeUrl,
            DATABASE_SSL: "false",
            AUTH_JWT_CLOCK_TOLERANCE_SECONDS: "0",
        }),
    );

    children.push(
        spawnProcess(
            process.execPath,
            [
                resolve(repositoryRoot, "apps/web/node_modules/next/dist/bin/next"),
                "dev",
                ".",
                "--hostname",
                "127.0.0.1",
                "--port",
                "3000",
            ],
            {
                ...workos,
                NODE_ENV: "development",
                WORKOS_COOKIE_PASSWORD: "ardenfold-e2e-cookie-password-at-least-32-bytes",
                NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3000/auth/callback",
                ARDENFOLD_API_URL: "http://127.0.0.1:3001",
            },
            resolve(repositoryRoot, "apps/web"),
        ),
    );

    await Promise.all([
        waitFor("http://127.0.0.1:4010/health"),
        waitFor("http://127.0.0.1:3001/health/ready"),
        waitFor("http://localhost:3000/en"),
    ]);
    console.log("Platform security harness ready.");
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Platform security harness failed.");
    void shutdown(1);
});
