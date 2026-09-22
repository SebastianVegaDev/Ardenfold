import "reflect-metadata";

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { DatabaseService } from "../infrastructure/database/database.service";
import { configureHttp, createHttpAdapter } from "../http/contracts";
import { createOpenApiDocument, serializeOpenApi } from "../http/openapi";

async function main(): Promise<void> {
    Object.assign(process.env, {
        NODE_ENV: "test",
        API_PORT: "3001",
        DATABASE_URL: "postgresql://openapi:unused@localhost:1/openapi",
        DATABASE_SSL: "false",
        DATABASE_POOL_MAX: "1",
        DATABASE_IDLE_TIMEOUT_MS: "1000",
        DATABASE_CONNECTION_TIMEOUT_MS: "1000",
        WORKOS_CLIENT_ID: "client_openapi",
        WORKOS_API_KEY: "test-only-api-key",
        WORKOS_ISSUER: "https://api.workos.com/",
        WORKOS_JWKS_URL: "https://api.workos.com/sso/jwks/client_openapi",
        AUTH_JWT_CLOCK_TOLERANCE_SECONDS: "5",
    });

    const { AppModule } = await import("../app.module.js");

    const module = await Test.createTestingModule({
        imports: [AppModule],
    })
        .overrideProvider(DatabaseService)
        .useValue({
            ping: () => Promise.resolve(),
        })
        .compile();

    const app = module.createNestApplication<NestFastifyApplication>(createHttpAdapter(), {
        logger: false,
    });

    try {
        configureHttp(app);

        const content = serializeOpenApi(createOpenApiDocument(app));

        const target = resolve(__dirname, "../../../..", "docs/api/openapi.json");

        if (process.argv.includes("--check")) {
            const existing = await readFile(target, "utf8");

            if (existing.replace(/\r\n/g, "\n") !== content) {
                throw new Error(
                    "OpenAPI drift: run pnpm --filter @ardenfold/api openapi:generate and commit docs/api/openapi.json",
                );
            }

            console.log("OpenAPI contract is up to date.");
        } else {
            await mkdir(resolve(target, ".."), {
                recursive: true,
            });

            await writeFile(target, content, "utf8");

            console.log("Generated docs/api/openapi.json");
        }
    } finally {
        await app.close();
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
