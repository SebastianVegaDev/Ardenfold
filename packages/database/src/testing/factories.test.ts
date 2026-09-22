import { describe, expect, it } from "vitest";

import {
    buildExternalIdentity,
    buildOrganization,
    buildOrganizationMembership,
    buildOrganizationSite,
    buildUser,
    resetDatabaseFactorySequence,
} from "./factories";

describe("database development factories", () => {
    it("builds deterministic values without production seed data", () => {
        resetDatabaseFactorySequence();

        const organization = buildOrganization();
        const user = buildUser();
        const identity = buildExternalIdentity("00000000-0000-4000-8000-000000000001");
        const site = buildOrganizationSite("00000000-0000-4000-8000-000000000002");
        const membership = buildOrganizationMembership(
            "00000000-0000-4000-8000-000000000002",
            "00000000-0000-4000-8000-000000000001",
        );

        expect(organization.name).toBe("Test Organization 1");
        expect(user.primaryEmail).toBe("user-2@example.test");
        expect(identity.subject).toBe("subject-3");
        expect(site.code).toBe("SITE-4");
        expect(membership.status).toBe("active");
        expect(organization).not.toHaveProperty("id");
    });
});
