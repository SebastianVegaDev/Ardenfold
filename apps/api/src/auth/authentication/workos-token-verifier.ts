import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import type { EnvironmentVariables } from "../../config/environment";
import type { WorkosTokenClaims } from "./types";

function requiredClaim(payload: JWTPayload, claim: "sub" | "sid" | "client_id"): string {
    const value = payload[claim];

    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Access token is missing the ${claim} claim.`);
    }

    return value;
}

@Injectable()
export class WorkosTokenVerifier {
    private readonly clientId: string;
    private readonly issuer: string;
    private readonly clockTolerance: number;
    private readonly keySet: ReturnType<typeof createRemoteJWKSet>;

    constructor(config: ConfigService<EnvironmentVariables, true>) {
        this.clientId = config.get("WORKOS_CLIENT_ID", { infer: true });
        this.issuer = config.get("WORKOS_ISSUER", { infer: true });
        this.clockTolerance = config.get("AUTH_JWT_CLOCK_TOLERANCE_SECONDS", { infer: true });
        this.keySet = createRemoteJWKSet(new URL(config.get("WORKOS_JWKS_URL", { infer: true })), {
            cooldownDuration: 30_000,
            cacheMaxAge: 10 * 60_000,
            timeoutDuration: 5_000,
        });
    }

    async verify(token: string): Promise<WorkosTokenClaims> {
        const { payload } = await jwtVerify(token, this.keySet, {
            issuer: this.issuer,
            algorithms: ["RS256"],
            clockTolerance: this.clockTolerance,
            requiredClaims: ["sub", "sid", "client_id", "iat", "exp"],
        });

        const clientId = requiredClaim(payload, "client_id");

        // WorkOS first-party access tokens do not currently document an aud
        // claim. client_id is therefore the explicit application binding.
        if (clientId !== this.clientId) {
            throw new Error("Access token belongs to a different WorkOS application.");
        }

        return {
            issuer: this.issuer,
            subject: requiredClaim(payload, "sub"),
            sessionId: requiredClaim(payload, "sid"),
        };
    }
}
