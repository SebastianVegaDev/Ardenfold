import type { OrganizationSummary } from "@ardenfold/contracts";
import { describe, expect, it } from "vitest";

import { resolveActiveOrganization } from "./organization-context";

const organizations: OrganizationSummary[] = [
    {
        id: "00000000-0000-4000-8000-000000000010",
        name: "North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
        role: "owner",
    },
    {
        id: "00000000-0000-4000-8000-000000000020",
        name: "South",
        defaultLocale: "es",
        defaultTimeZone: "America/Lima",
        role: "viewer",
    },
];

describe("active organization selection", () => {
    it("retains an accessible requested organization", () => {
        expect(resolveActiveOrganization(organizations, organizations[1]!.id)).toBe(organizations[1]);
    });

    it("falls back safely when the stored selection is stale or unauthorized", () => {
        expect(resolveActiveOrganization(organizations, "00000000-0000-4000-8000-999999999999")).toBe(
            organizations[0],
        );
        expect(resolveActiveOrganization([], organizations[0]!.id)).toBeUndefined();
    });
});
