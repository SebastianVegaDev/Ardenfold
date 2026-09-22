import { externalIdentities, users, type User } from "@ardenfold/database/schema";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { DatabaseService } from "../infrastructure/database/database.service";
import type { WorkosTokenClaims } from "./auth.types";
import { WorkosProfileService } from "./workos-profile.service";

const PROVIDER = "workos";

class IdentityProvisioningRace extends Error {}

@Injectable()
export class IdentityService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly profiles: WorkosProfileService,
    ) {}

    async resolve(claims: WorkosTokenClaims): Promise<User> {
        const existing = await this.find(claims);

        if (existing) {
            await this.touch(claims);
            return existing;
        }

        const profile = await this.profiles.getUser(claims.subject);

        if (!profile.emailVerified) {
            throw new UnauthorizedException("A verified email address is required.");
        }

        try {
            return await this.databaseService.globalDatabase.transaction(async (transaction) => {
                const concurrent = await transaction
                    .select({ user: users })
                    .from(externalIdentities)
                    .innerJoin(users, eq(users.id, externalIdentities.userId))
                    .where(this.identityPredicate(claims))
                    .limit(1);

                if (concurrent[0]) {
                    return concurrent[0].user;
                }

                const [created] = await transaction
                    .insert(users)
                    .values({
                        primaryEmail: profile.email,
                        displayName: profile.displayName,
                    })
                    .returning();

                if (!created) {
                    throw new Error("Failed to create local user.");
                }

                const identity = await transaction
                    .insert(externalIdentities)
                    .values({
                        userId: created.id,
                        provider: PROVIDER,
                        issuer: claims.issuer,
                        subject: claims.subject,
                        lastAuthenticatedAt: new Date(),
                    })
                    .onConflictDoNothing()
                    .returning({ id: externalIdentities.id });

                if (!identity[0]) {
                    throw new IdentityProvisioningRace();
                }

                return created;
            });
        } catch (error) {
            if (!(error instanceof IdentityProvisioningRace)) {
                throw error;
            }

            const winner = await this.find(claims);

            if (!winner) {
                throw error;
            }

            return winner;
        }
    }

    private identityPredicate(claims: WorkosTokenClaims) {
        return and(
            eq(externalIdentities.provider, PROVIDER),
            eq(externalIdentities.issuer, claims.issuer),
            eq(externalIdentities.subject, claims.subject),
        );
    }

    private async find(claims: WorkosTokenClaims): Promise<User | undefined> {
        const result = await this.databaseService.globalDatabase
            .select({ user: users })
            .from(externalIdentities)
            .innerJoin(users, eq(users.id, externalIdentities.userId))
            .where(this.identityPredicate(claims))
            .limit(1);

        return result[0]?.user;
    }

    private async touch(claims: WorkosTokenClaims): Promise<void> {
        await this.databaseService.globalDatabase
            .update(externalIdentities)
            .set({
                lastAuthenticatedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(this.identityPredicate(claims));
    }
}
