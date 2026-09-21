import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "./app.module";

describe("API smoke test", () => {
    let app: NestFastifyApplication | undefined;

    beforeAll(async () => {
        const testingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = testingModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
        if (app !== undefined) {
            await app.close();
        }
    });

    it("responds successfully to GET /health", async () => {
        if (app === undefined) {
            throw new Error("The test application was not initialized.");
        }

        const response = await app.inject({
            method: "GET",
            url: "/health",
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('{"status":"ok","service":"api"}');
    });
});
