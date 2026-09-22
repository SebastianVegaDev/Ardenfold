import type { User } from "@ardenfold/database/schema";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthenticationGuard } from "./authentication.guard";
import type { IdentityService } from "./identity.service";
import type { WorkosTokenVerifier } from "./workos-token-verifier";

const user: User = {
    id: "8059fc7b-2204-4ae8-93a3-56d906651a12",
    primaryEmail: "ada@example.com",
    displayName: "Ada Lovelace",
    preferredLocale: null,
    preferredTimeZone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

function context(authorization?: string) {
    const request: { headers: { authorization?: string }; principal?: unknown } = {
        headers: authorization === undefined ? {} : { authorization },
    };

    return {
        request,
        execution: {
            getHandler: () => function handler() {},
            getClass: () => class Controller {},
            switchToHttp: () => ({ getRequest: () => request }),
        } as unknown as ExecutionContext,
    };
}

describe("AuthenticationGuard", () => {
    function guard(options?: { tokenFailure?: boolean; identityFailure?: boolean }) {
        const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
        const tokens = {
            verify: options?.tokenFailure
                ? vi.fn().mockRejectedValue(new Error("invalid token"))
                : vi.fn().mockResolvedValue({
                      issuer: "https://api.workos.com/",
                      subject: "user_123",
                      sessionId: "session_123",
                  }),
        };
        const identities = {
            resolve: options?.identityFailure
                ? vi.fn().mockRejectedValue(new Error("database unavailable"))
                : vi.fn().mockResolvedValue(user),
        };

        return {
            instance: new AuthenticationGuard(
                reflector as never,
                tokens as unknown as WorkosTokenVerifier,
                identities as unknown as IdentityService,
            ),
            tokens,
            identities,
        };
    }

    it("derives the principal exclusively from a verified token and local identity", async () => {
        const { instance, tokens, identities } = guard();
        const requestContext = context("Bearer signed-token");

        await expect(instance.canActivate(requestContext.execution)).resolves.toBe(true);
        expect(tokens.verify).toHaveBeenCalledWith("signed-token");
        expect(identities.resolve).toHaveBeenCalledWith({
            issuer: "https://api.workos.com/",
            subject: "user_123",
            sessionId: "session_123",
        });
        expect(requestContext.request.principal).toMatchObject({
            user,
            sessionId: "session_123",
            externalIdentity: { provider: "workos", subject: "user_123" },
        });
    });

    it("rejects missing, malformed and invalid credentials", async () => {
        const missing = guard();
        await expect(missing.instance.canActivate(context().execution)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );

        const invalid = guard({ tokenFailure: true });
        await expect(
            invalid.instance.canActivate(context("Bearer invalid").execution),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(invalid.identities.resolve).not.toHaveBeenCalled();
    });

    it("does not misclassify identity infrastructure failures as invalid credentials", async () => {
        const { instance } = guard({ identityFailure: true });

        await expect(instance.canActivate(context("Bearer valid").execution)).rejects.toThrow(
            "database unavailable",
        );
    });
});
