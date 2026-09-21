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
        },
    },
});
