import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WorkOS } from "@workos-inc/node";

import type { EnvironmentVariables } from "../config/environment";

export type ExternalUserProfile = Readonly<{
    email: string;
    emailVerified: boolean;
    displayName: string | null;
}>;

@Injectable()
export class WorkosProfileService {
    private readonly workos: WorkOS;

    constructor(config: ConfigService<EnvironmentVariables, true>) {
        this.workos = new WorkOS(config.get("WORKOS_API_KEY", { infer: true }), {
            clientId: config.get("WORKOS_CLIENT_ID", { infer: true }),
        });
    }

    async getUser(subject: string): Promise<ExternalUserProfile> {
        const user = await this.workos.userManagement.getUser(subject);
        const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

        return {
            email: user.email.trim().toLowerCase(),
            emailVerified: user.emailVerified,
            displayName: displayName.length > 0 ? displayName : null,
        };
    }
}
