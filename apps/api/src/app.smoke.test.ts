import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "./app.module";
import { DatabaseService } from "./infrastructure/database/database.service";

describe("API smoke test", () => {
    let app: NestFastifyApplication | undefined;

    const ping = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    beforeAll(async () => {
        const testingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(DatabaseService)
            .useValue({
                ping,
            })
            .compile();

        app = testingModule.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
        if (app !== undefined) {
            await app.close();
        }
    });

    it("responds successfully when the database is available", async () => {
        if (app === undefined) {
            throw new Error("The test application was not initialized.");
        }

        const response = await app.inject({
            method: "GET",
            url: "/health",
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('{"status":"ok","service":"api","database":"up"}');
        expect(ping).toHaveBeenCalledOnce();
    });
});
