import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";

import { getAccessibleOrganizations } from "./api-client";
import { activeOrganizationCookie, resolveActiveOrganization } from "./organization-context";

export async function getActiveOrganizationSession() {
    const session = await withAuth({ ensureSignedIn: true });
    const [organizations, cookieStore] = await Promise.all([
        getAccessibleOrganizations(session.accessToken),
        cookies(),
    ]);
    const organization = resolveActiveOrganization(
        organizations.data,
        cookieStore.get(activeOrganizationCookie)?.value,
    );

    if (!organization) {
        throw new Error("An active organization is required.");
    }

    return { session, organization };
}
