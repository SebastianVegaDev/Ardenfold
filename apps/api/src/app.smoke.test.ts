import "reflect-metadata";

import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import {
    apiErrorSchema,
    livenessResponseSchema,
    paginationQuerySchema,
    readinessResponseSchema,
    type PaginationQuery,
} from "@ardenfold/contracts";
import { getCorrelationId } from "@ardenfold/observability";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

    @Get("correlation")
    correlation(): { correlationId: string | undefined } {
        return { correlationId: getCorrelationId() };
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

    beforeEach(() => {
        ping.mockClear();
    });

    afterAll(async () => {
        await app?.close();
    });

    it("separates liveness from database-dependent readiness", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/health/live",
        });

        expect(response.statusCode).toBe(200);

        expect(livenessResponseSchema.parse(JSON.parse(response.body))).toEqual({
            status: "ok",
            service: "api",
        });

        expect(ping).not.toHaveBeenCalled();

        const ready = await app.inject({
            method: "GET",
            url: "/health/ready",
        });

        expect(ready.statusCode).toBe(200);

        expect(readinessResponseSchema.parse(JSON.parse(ready.body))).toEqual({
            status: "ok",
            service: "api",
            database: "up",
        });

        expect(ping).toHaveBeenCalledOnce();

        const prefixed = await app.inject({
            method: "GET",
            url: "/api/v1/health/live",
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

    it("preserves a valid client correlation identifier", async () => {
        const correlationId = "a8bd24ba-8f34-4a0e-9dd1-32db354ceac6";

        const response = await app.inject({
            method: "GET",
            url: "/api/v1/contract-probe/correlation",
            headers: {
                "x-request-id": correlationId,
            },
        });

        expect(response.headers["x-request-id"]).toBe(correlationId);
        expect(JSON.parse(response.body)).toEqual({ correlationId });
    });

    it("generates deterministic OpenAPI with the actual route prefixes", () => {
        const document = createOpenApiDocument(app);

        expect(document.paths["/health/live"]?.get?.operationId).toBe("getLiveness");
        expect(document.paths["/health/ready"]?.get?.operationId).toBe("getReadiness");
        expect(document.paths["/api/v1/health/live"]).toBeUndefined();
        expect(document.paths["/api/v1/contract-probe"]).toBeDefined();
        expect(document.components?.schemas?.["ApiError"]).toBeDefined();

        expect(serializeOpenApi(document)).toBe(serializeOpenApi(createOpenApiDocument(app)));
    });
});
