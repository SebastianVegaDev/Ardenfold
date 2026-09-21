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
        });

        expect(environment).toEqual({
            NODE_ENV: "test",
            API_PORT: 4000,
            DATABASE_URL: "postgresql://ardenfold_app:password@localhost:5432/ardenfold",
            DATABASE_SSL: false,
            DATABASE_POOL_MAX: 5,
            DATABASE_IDLE_TIMEOUT_MS: 10_000,
            DATABASE_CONNECTION_TIMEOUT_MS: 2_000,
        });
    });

    it("rejects a missing database URL", () => {
        expect(() => {
            validateEnvironment({});
        }).toThrow(/DATABASE_URL/);
    });
});
