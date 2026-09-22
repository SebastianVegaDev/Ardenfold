import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "api",
        environment: "node",
        include: ["src/**/*.test.ts"],
        clearMocks: true,
        restoreMocks: true,
        env: {
            NODE_ENV: "test",
            API_PORT: "3001",
            DATABASE_URL: "postgresql://ardenfold_app:test@localhost:5432/ardenfold_test",
            DATABASE_SSL: "false",
            DATABASE_POOL_MAX: "5",
            DATABASE_IDLE_TIMEOUT_MS: "10000",
            DATABASE_CONNECTION_TIMEOUT_MS: "2000",
            WORKOS_CLIENT_ID: "client_test",
            WORKOS_API_KEY: "test-only-api-key",
            WORKOS_ISSUER: "https://api.workos.com/",
            WORKOS_JWKS_URL: "https://api.workos.com/sso/jwks/client_test",
            AUTH_JWT_CLOCK_TOLERANCE_SECONDS: "5",
        },
    },
});
