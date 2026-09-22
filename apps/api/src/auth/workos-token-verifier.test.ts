import { createServer, type Server } from "node:http";

import { ConfigService } from "@nestjs/config";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EnvironmentVariables } from "../config/environment";
import { WorkosTokenVerifier } from "./workos-token-verifier";

describe("WorkosTokenVerifier", () => {
    let server: Server;
    let privateKey: CryptoKey;
    let publicJwk: JWK;
    let jwksUrl: string;

    beforeAll(async () => {
        const pair = await generateKeyPair("RS256", { extractable: true });
        privateKey = pair.privateKey;
        publicJwk = {
            ...(await exportJWK(pair.publicKey)),
            kid: "test-key",
            use: "sig",
            alg: "RS256",
        };

        server = createServer((_request, response) => {
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ keys: [publicJwk] }));
        });

        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();

        if (!address || typeof address === "string") {
            throw new Error("Test JWKS server did not bind a TCP port.");
        }

        jwksUrl = `http://127.0.0.1:${address.port}/jwks`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    });

    function verifier(clientId = "client_test", issuer = "https://api.workos.com/") {
        return new WorkosTokenVerifier(
            new ConfigService<EnvironmentVariables, true>({
                    WORKOS_CLIENT_ID: clientId,
                    WORKOS_ISSUER: issuer,
                    WORKOS_JWKS_URL: jwksUrl,
                    AUTH_JWT_CLOCK_TOLERANCE_SECONDS: 0,
                } as EnvironmentVariables),
        );
    }

    async function sign(overrides: Record<string, unknown> = {}) {
        const now = Math.floor(Date.now() / 1_000);

        return new SignJWT({
            sid: "session_123",
            client_id: "client_test",
            ...overrides,
        })
            .setProtectedHeader({ alg: "RS256", kid: "test-key" })
            .setIssuer("https://api.workos.com/")
            .setSubject("user_123")
            .setIssuedAt(now)
            .setExpirationTime(now + 300)
            .sign(privateKey);
    }

    it("accepts a signed, current token bound to the configured application", async () => {
        await expect(verifier().verify(await sign())).resolves.toEqual({
            issuer: "https://api.workos.com/",
            subject: "user_123",
            sessionId: "session_123",
        });
    });

    it("rejects a token issued for another application", async () => {
        await expect(verifier().verify(await sign({ client_id: "client_other" }))).rejects.toThrow(
            /different WorkOS application/,
        );
    });

    it("rejects expired tokens", async () => {
        const now = Math.floor(Date.now() / 1_000);
        const token = await new SignJWT({ sid: "session_123", client_id: "client_test" })
            .setProtectedHeader({ alg: "RS256", kid: "test-key" })
            .setIssuer("https://api.workos.com/")
            .setSubject("user_123")
            .setIssuedAt(now - 600)
            .setExpirationTime(now - 300)
            .sign(privateKey);

        await expect(verifier().verify(token)).rejects.toThrow();
    });

    it("rejects tokens from another issuer", async () => {
        await expect(verifier("client_test", "https://issuer.example.com/").verify(await sign())).rejects.toThrow();
    });
});
