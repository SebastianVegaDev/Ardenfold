import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ContractException } from "../../http/contracts";
import { OrganizationAuthorizationGuard } from "./organization-authorization.guard";
import type { OrganizationAuthorizationService } from "./organization-authorization.service";

const organizationId = "8059fc7b-2204-4ae8-93a3-56d906651a12";
const userId = "f034c42c-9254-42d7-a69d-643b6c7aa684";

function executionContext(header?: string) {
    const request = {
        headers: header === undefined ? {} : { "x-ardenfold-organization-id": header },
        principal: {
            user: { id: userId },
        },
        organizationContext: undefined as unknown,
    };

    return {
        request,
        context: {
            getHandler: () => function handler() {},
            getClass: () => class Controller {},
            switchToHttp: () => ({ getRequest: () => request }),
        } as unknown as ExecutionContext,
    };
}

describe("OrganizationAuthorizationGuard", () => {
    it("does nothing for routes without an organization permission contract", async () => {
        const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
        const authorization = { authorize: vi.fn() };
        const guard = new OrganizationAuthorizationGuard(
            reflector as never,
            authorization as unknown as OrganizationAuthorizationService,
        );

        await expect(guard.canActivate(executionContext().context)).resolves.toBe(true);
        expect(authorization.authorize).not.toHaveBeenCalled();
    });

    it("resolves membership and permissions before attaching organization context", async () => {
        const resolved = {
            id: organizationId,
            name: "Ardenfold Test",
            defaultLocale: "en",
            defaultTimeZone: "UTC",
            role: "viewer" as const,
            permissions: ["organization.read" as const],
        };
        const reflector = {
            getAllAndOverride: vi.fn().mockReturnValue(["organization.read"]),
        };
        const authorization = { authorize: vi.fn().mockResolvedValue(resolved) };
        const guard = new OrganizationAuthorizationGuard(
            reflector as never,
            authorization as unknown as OrganizationAuthorizationService,
        );
        const request = executionContext(organizationId);

        await expect(guard.canActivate(request.context)).resolves.toBe(true);
        expect(authorization.authorize).toHaveBeenCalledWith(userId, organizationId, [
            "organization.read",
        ]);
        expect(request.request.organizationContext).toBe(resolved);
    });

    it("rejects missing and malformed organization context before querying authorization", async () => {
        const reflector = {
            getAllAndOverride: vi.fn().mockReturnValue(["organization.read"]),
        };
        const authorization = { authorize: vi.fn() };
        const guard = new OrganizationAuthorizationGuard(
            reflector as never,
            authorization as unknown as OrganizationAuthorizationService,
        );

        for (const header of [undefined, "not-a-uuid"]) {
            let received: unknown;

            try {
                await guard.canActivate(executionContext(header).context);
            } catch (error) {
                received = error;
            }

            expect(received).toBeInstanceOf(ContractException);
            expect(received).toMatchObject({ code: "ORGANIZATION_CONTEXT_REQUIRED" });
        }

        expect(authorization.authorize).not.toHaveBeenCalled();
    });
});
