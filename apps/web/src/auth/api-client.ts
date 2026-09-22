import {
    authenticatedUserResponseSchema,
    type AuthenticatedUserResponse,
} from "@ardenfold/contracts";

import { getServerEnvironment } from "@/config/environment";

export async function getAuthenticatedUser(accessToken: string): Promise<AuthenticatedUserResponse> {
    const environment = getServerEnvironment();
    const response = await fetch(new URL("/api/v1/auth/me", environment.ARDENFOLD_API_URL), {
        headers: {
            authorization: `Bearer ${accessToken}`,
            accept: "application/json",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Ardenfold API rejected the authenticated session (${response.status}).`);
    }

    return authenticatedUserResponseSchema.parse(await response.json());
}
