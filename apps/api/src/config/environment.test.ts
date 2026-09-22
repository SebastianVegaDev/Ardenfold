import { describe, expect, it } from "vitest";

import { validateEnvironment } from "./environment";

describe("environment configuration", () => {
    it("parses valid environment variables", () => {
        const environment = validateEnvironment({
            NODE_ENV: "test",
            API_PORT: "4000",
            DATABASE_URL: "postgresql://ardenfold_app:password@localhost:5432/ardenfold",
            DATABASE_SSL: "false",
            DATABASE_POOL_MAX: "5",
            DATABASE_IDLE_TIMEOUT_MS: "10000",
            DATABASE_CONNECTION_TIMEOUT_MS: "2000",
            WORKOS_CLIENT_ID: "client_test",
            WORKOS_API_KEY: "test-only-api-key",
            WORKOS_ISSUER: "https://api.workos.com/",
            WORKOS_JWKS_URL: "https://api.workos.com/sso/jwks/client_test",
            AUTH_JWT_CLOCK_TOLERANCE_SECONDS: "5",
        });

        expect(environment).toEqual({
            NODE_ENV: "test",
            API_PORT: 4000,
            DATABASE_URL: "postgresql://ardenfold_app:password@localhost:5432/ardenfold",
            DATABASE_SSL: false,
            DATABASE_POOL_MAX: 5,
            DATABASE_IDLE_TIMEOUT_MS: 10_000,
            DATABASE_CONNECTION_TIMEOUT_MS: 2_000,
            WORKOS_CLIENT_ID: "client_test",
            WORKOS_API_KEY: "test-only-api-key",
            WORKOS_ISSUER: "https://api.workos.com/",
            WORKOS_JWKS_URL: "https://api.workos.com/sso/jwks/client_test",
            AUTH_JWT_CLOCK_TOLERANCE_SECONDS: 5,
        });
    });

    it("rejects a missing database URL", () => {
        expect(() => {
            validateEnvironment({});
        }).toThrow(/DATABASE_URL/);
    });
});
