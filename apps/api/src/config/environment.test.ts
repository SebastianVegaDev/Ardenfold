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
            WORKOS_API_HOSTNAME: "localhost",
            WORKOS_API_HTTPS: "false",
            WORKOS_API_PORT: "4010",
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
            WORKOS_API_HOSTNAME: "localhost",
            WORKOS_API_HTTPS: false,
            WORKOS_API_PORT: 4010,
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

    it("rejects incomplete file storage settings", () => {
        expect(() =>
            validateEnvironment({
                NODE_ENV: "test",
                DATABASE_URL: "postgresql://ardenfold_app:password@localhost:5432/ardenfold",
                WORKOS_CLIENT_ID: "client_test",
                WORKOS_API_KEY: "test-only-api-key",
                WORKOS_ISSUER: "https://api.workos.com/",
                WORKOS_JWKS_URL: "https://api.workos.com/sso/jwks/client_test",
                FILE_STORAGE_BUCKET: "private-files",
            }),
        ).toThrow(/FILE_STORAGE_REGION/);
    });

    it("rejects insecure WorkOS endpoints outside tests", () => {
        expect(() => {
            validateEnvironment({
                NODE_ENV: "production",
                DATABASE_URL: "postgresql://ardenfold_app:password@localhost:5432/ardenfold",
                WORKOS_CLIENT_ID: "client_test",
                WORKOS_API_KEY: "test-only-api-key",
                WORKOS_API_HTTPS: "false",
                WORKOS_ISSUER: "http://localhost:4010/",
                WORKOS_JWKS_URL: "http://localhost:4010/sso/jwks/client_test",
            });
        }).toThrow(/HTTPS/);
    });
});
