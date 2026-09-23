import { describe, expect, it } from "vitest";

import {
    buildAsset,
    buildAssetIdentifier,
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

    it("builds independent asset identity fixtures", () => {
        resetDatabaseFactorySequence();
        const organizationId = "00000000-0000-4000-8000-000000000002";
        const assetId = "00000000-0000-4000-8000-000000000003";
        const asset = buildAsset(organizationId);
        const identifier = buildAssetIdentifier(organizationId, assetId);

        expect(asset.displayName).toBe("Test Asset 1");
        expect(asset).not.toHaveProperty("ownerPartyId");
        expect(identifier.type).toBe("serial_number");
        expect(identifier.originalValue).toBe("SN 2");
        expect(identifier.assetId).toBe(assetId);
    });
});
