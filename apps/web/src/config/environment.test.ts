import { describe, expect, it } from "vitest";

import { validateServerEnvironment } from "./environment";

describe("web environment configuration", () => {
    const valid = {
        WORKOS_CLIENT_ID: "client_test",
        WORKOS_API_KEY: "test-only-api-key",
        WORKOS_COOKIE_PASSWORD: "test-only-cookie-password-32-bytes-minimum",
        NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3000/auth/callback",
        ARDENFOLD_API_URL: "http://localhost:3001",
    };

    it("accepts a complete server configuration", () => {
        expect(validateServerEnvironment(valid)).toEqual(valid);
    });

    it("rejects weak session cookie secrets", () => {
        expect(() =>
            validateServerEnvironment({ ...valid, WORKOS_COOKIE_PASSWORD: "too-short" }),
        ).toThrow(/WORKOS_COOKIE_PASSWORD/);
    });

    it("rejects a missing private API URL", () => {
        expect(() => validateServerEnvironment({ ...valid, ARDENFOLD_API_URL: undefined })).toThrow(
            /ARDENFOLD_API_URL/,
        );
    });
});
