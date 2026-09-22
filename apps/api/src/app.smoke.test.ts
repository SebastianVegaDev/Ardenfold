import "reflect-metadata";

import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import {
    apiErrorSchema,
    healthResponseSchema,
    paginationQuerySchema,
    type PaginationQuery,
} from "@ardenfold/contracts";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppModule } from "./app.module";
import { DatabaseService } from "./infrastructure/database/database.service";

import { configureHttp, createHttpAdapter, ContractValidationPipe } from "./http/contracts";

import { createOpenApiDocument, serializeOpenApi } from "./http/openapi";

const probeSchema = z.strictObject({
    name: z.string().min(1),
});

@Controller("contract-probe")
class ContractProbeController {
    @Get()
    list(
        @Query(new ContractValidationPipe(paginationQuerySchema))
        query: PaginationQuery,
    ) {
        return query;
    }

    @Post()
    create(
        @Body(new ContractValidationPipe(probeSchema))
        body: z.infer<typeof probeSchema>,
    ) {
        return body;
    }

    @Get("failure")
    failure(): never {
        throw new Error("secret-database-password");
    }
}

describe("HTTP contracts", () => {
    let app: NestFastifyApplication;

    const ping = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [AppModule],
            controllers: [ContractProbeController],
        })
            .overrideProvider(DatabaseService)
            .useValue({
                ping,
            })
            .compile();

        app = module.createNestApplication<NestFastifyApplication>(createHttpAdapter(), {
            logger: false,
        });

        configureHttp(app);

        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
        await app?.close();
    });

    it("keeps health outside the business prefix", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/health",
        });

        expect(response.statusCode).toBe(200);

        expect(healthResponseSchema.parse(JSON.parse(response.body))).toEqual({
            status: "ok",
            service: "api",
            database: "up",
        });

        expect(ping).toHaveBeenCalledOnce();

        const prefixed = await app.inject({
            method: "GET",
            url: "/api/v1/health",
        });

        expect(prefixed.statusCode).toBe(404);
    });

    it("prefixes business routes and parses query values", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/api/v1/contract-probe?page=2&limit=10",
        });

        expect(response.statusCode).toBe(200);

        expect(JSON.parse(response.body)).toEqual({
            page: 2,
            limit: 10,
        });

        const unprefixed = await app.inject({
            method: "GET",
            url: "/contract-probe",
        });

        expect(unprefixed.statusCode).toBe(404);
    });

    it("identifies invalid fields without returning rejected values", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/v1/contract-probe",
            payload: {
                name: 123,
            },
        });

        expect(response.statusCode).toBe(400);

        const body = apiErrorSchema.parse(JSON.parse(response.body));

        expect(body.error.code).toBe("VALIDATION_FAILED");

        expect(body.error.issues).toContainEqual({
            source: "body",
            path: "/name",
            code: "INVALID_TYPE",
        });

        expect(body.error.traceId).toBe(response.headers["x-request-id"]);
        expect(response.body).not.toContain("123");
    });

    it("rejects unknown fields", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/v1/contract-probe",
            payload: {
                name: "test",
                unexpected: true,
            },
        });

        expect(response.statusCode).toBe(400);

        const body = apiErrorSchema.parse(JSON.parse(response.body));

        expect(body.error.issues[0]?.code).toBe("UNKNOWN_FIELD");
    });

    it("normalizes malformed JSON", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/api/v1/contract-probe",
            headers: {
                "content-type": "application/json",
            },
            payload: '{"name":',
        });

        expect(response.statusCode).toBe(400);

        const body = apiErrorSchema.parse(JSON.parse(response.body));

        expect(body.error.code).toBe("BAD_REQUEST");
    });

    it("masks unexpected errors and replaces client request identifiers", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/api/v1/contract-probe/failure",
            headers: {
                "x-request-id": "untrusted",
            },
        });

        expect(response.statusCode).toBe(500);

        const body = apiErrorSchema.parse(JSON.parse(response.body));

        expect(body.error.code).toBe("INTERNAL_ERROR");
        expect(body.error.traceId).toBe(response.headers["x-request-id"]);
        expect(body.error.traceId).not.toBe("untrusted");
        expect(response.body).not.toContain("secret-database-password");
    });

    it("generates deterministic OpenAPI with the actual route prefixes", () => {
        const document = createOpenApiDocument(app);

        expect(document.paths["/health"]?.get?.operationId).toBe("getHealth");
        expect(document.paths["/api/v1/health"]).toBeUndefined();
        expect(document.paths["/api/v1/contract-probe"]).toBeDefined();
        expect(document.components?.schemas?.["ApiError"]).toBeDefined();

        expect(serializeOpenApi(document)).toBe(serializeOpenApi(createOpenApiDocument(app)));
    });
});
