import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

const issuer = "http://127.0.0.1:4010/";
const clientId = "client_e2e";
const keyId = "ardenfold-e2e-key";

type Identity = Readonly<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    shortSession?: boolean;
}>;

const identities: readonly Identity[] = [
    { id: "user_e2e_owner", email: "owner@example.test", firstName: "Ada", lastName: "Owner" },
    { id: "user_e2e_member", email: "member@example.test", firstName: "Grace", lastName: "Member" },
    {
        id: "user_e2e_expiring",
        email: "expiry@example.test",
        firstName: "Eve",
        lastName: "Expiring",
        shortSession: true,
    },
];

const identityById = new Map(identities.map((identity) => [identity.id, identity]));

type AuthorizationCode = Readonly<{
    identity: Identity;
    challenge: string;
    expiresAt: number;
}>;

function sendJson(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(value));
}

function sendError(response: ServerResponse, status: number, message: string): void {
    sendJson(response, status, {
        error: status === 401 ? "invalid_grant" : "invalid_request",
        message,
    });
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function workosUser(identity: Identity) {
    const now = new Date().toISOString();
    return {
        object: "user",
        id: identity.id,
        email: identity.email,
        email_verified: true,
        first_name: identity.firstName,
        last_name: identity.lastName,
        profile_picture_url: null,
        last_sign_in_at: now,
        locale: "en",
        created_at: now,
        updated_at: now,
        external_id: null,
        metadata: {},
    };
}

function htmlEscape(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

export async function startMockWorkos(port = 4010) {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    const jwk = await exportJWK(publicKey);
    const codes = new Map<string, AuthorizationCode>();

    async function createAccessToken(identity: Identity): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        return new SignJWT({ client_id: clientId, sid: `session_${identity.id}` })
            .setProtectedHeader({ alg: "RS256", kid: keyId, typ: "JWT" })
            .setIssuer(issuer)
            .setSubject(identity.id)
            .setIssuedAt(now)
            .setExpirationTime(now + (identity.shortSession ? 8 : 15 * 60))
            .setJti(randomUUID())
            .sign(privateKey);
    }

    async function authenticationResponse(identity: Identity) {
        return {
            user: workosUser(identity),
            access_token: await createAccessToken(identity),
            refresh_token: `refresh_${identity.id}_${randomUUID()}`,
            authentication_method: { type: "password" },
        };
    }

    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url ?? "/", issuer);

            if (request.method === "GET" && url.pathname === "/health") {
                sendJson(response, 200, { status: "ok" });
                return;
            }

            if (request.method === "GET" && url.pathname === `/sso/jwks/${clientId}`) {
                sendJson(response, 200, {
                    keys: [{ ...jwk, alg: "RS256", kid: keyId, use: "sig" }],
                });
                return;
            }

            if (request.method === "GET" && url.pathname === "/user_management/authorize") {
                const redirectUri = url.searchParams.get("redirect_uri");
                const state = url.searchParams.get("state");
                const challenge = url.searchParams.get("code_challenge");
                if (redirectUri !== "http://localhost:3000/auth/callback" || !state || !challenge) {
                    sendError(response, 400, "Invalid authorization request.");
                    return;
                }

                const options = identities
                    .map((identity) => {
                        const authorize = new URL("/test/authorize", issuer);
                        authorize.searchParams.set("identity", identity.id);
                        authorize.searchParams.set("redirect_uri", redirectUri);
                        authorize.searchParams.set("state", state);
                        authorize.searchParams.set("code_challenge", challenge);
                        return `<li><a data-testid="${identity.id}" href="${htmlEscape(authorize.toString())}">${htmlEscape(identity.firstName)} ${htmlEscape(identity.lastName)}</a></li>`;
                    })
                    .join("");
                response.writeHead(200, {
                    "content-type": "text/html; charset=utf-8",
                    "cache-control": "no-store",
                });
                response.end(
                    `<!doctype html><html lang="en"><body><main><h1>Test identity provider</h1><ul>${options}</ul></main></body></html>`,
                );
                return;
            }

            if (request.method === "GET" && url.pathname === "/test/authorize") {
                const identity = identityById.get(url.searchParams.get("identity") ?? "");
                const redirectUri = url.searchParams.get("redirect_uri");
                const state = url.searchParams.get("state");
                const challenge = url.searchParams.get("code_challenge");
                if (
                    !identity ||
                    redirectUri !== "http://localhost:3000/auth/callback" ||
                    !state ||
                    !challenge
                ) {
                    sendError(response, 400, "Invalid test authorization.");
                    return;
                }
                const code = `code_${randomUUID()}`;
                codes.set(code, { identity, challenge, expiresAt: Date.now() + 60_000 });
                const callback = new URL(redirectUri);
                callback.searchParams.set("code", code);
                callback.searchParams.set("state", state);
                response.writeHead(302, {
                    location: callback.toString(),
                    "cache-control": "no-store",
                });
                response.end();
                return;
            }

            if (request.method === "POST" && url.pathname === "/user_management/authenticate") {
                const body = await readJson(request);
                if (body.grant_type === "refresh_token") {
                    const refreshToken =
                        typeof body.refresh_token === "string" ? body.refresh_token : "";
                    if (refreshToken.startsWith("refresh_user_e2e_expiring_")) {
                        sendError(response, 401, "The deterministic short session has expired.");
                        return;
                    }
                    const identity = identities.find((candidate) =>
                        refreshToken.startsWith(`refresh_${candidate.id}_`),
                    );
                    if (!identity) {
                        sendError(response, 401, "Refresh token is invalid.");
                        return;
                    }
                    sendJson(response, 200, await authenticationResponse(identity));
                    return;
                }

                const code = typeof body.code === "string" ? body.code : "";
                const authorization = codes.get(code);
                codes.delete(code);
                const verifier = typeof body.code_verifier === "string" ? body.code_verifier : "";
                const actualChallenge = createHash("sha256").update(verifier).digest("base64url");
                if (
                    !authorization ||
                    authorization.expiresAt < Date.now() ||
                    actualChallenge !== authorization.challenge ||
                    body.client_id !== clientId
                ) {
                    sendError(response, 401, "Authorization code is invalid.");
                    return;
                }
                sendJson(response, 200, await authenticationResponse(authorization.identity));
                return;
            }

            if (request.method === "GET" && url.pathname.startsWith("/user_management/users/")) {
                const identity = identityById.get(
                    decodeURIComponent(url.pathname.slice("/user_management/users/".length)),
                );
                if (!identity) {
                    sendError(response, 404, "User not found.");
                    return;
                }
                sendJson(response, 200, workosUser(identity));
                return;
            }

            if (request.method === "GET" && url.pathname === "/user_management/sessions/logout") {
                const returnTo = url.searchParams.get("return_to");
                response.writeHead(302, {
                    location: returnTo?.startsWith("http://localhost:3000/")
                        ? returnTo
                        : "http://localhost:3000/en",
                });
                response.end();
                return;
            }

            if (request.method === "GET" && url.pathname === "/test/access-token") {
                const identity = identityById.get(url.searchParams.get("identity") ?? "");
                if (!identity || identity.shortSession) {
                    sendError(response, 404, "Test identity not found.");
                    return;
                }
                sendJson(response, 200, { access_token: await createAccessToken(identity) });
                return;
            }

            sendError(response, 404, "Route not found.");
        } catch {
            sendError(response, 500, "Mock identity provider failure.");
        }
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
    });

    return {
        close: () =>
            new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            ),
    };
}
