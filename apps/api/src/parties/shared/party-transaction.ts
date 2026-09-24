import type { ArdenfoldTransaction } from "@ardenfold/database";
import { parties, type Party } from "@ardenfold/database/schema";
import { and, eq, sql } from "drizzle-orm";

import { ContractException } from "../http/contracts";

export async function getParty(
    transaction: ArdenfoldTransaction,
    organizationId: string,
    partyId: string,
): Promise<Party> {
    const [party] = await transaction
        .select()
        .from(parties)
        .where(and(eq(parties.organizationId, organizationId), eq(parties.id, partyId)));
    if (!party) {
        throw new ContractException("PARTY_NOT_FOUND", 404);
    }
    return party;
}

export async function advancePartyVersion(
    transaction: ArdenfoldTransaction,
    organizationId: string,
    partyId: string,
    expectedVersion: number,
    allowArchived = false,
): Promise<Party> {
    const party = await getParty(transaction, organizationId, partyId);
    if (party.version !== expectedVersion) {
        throw new ContractException("VERSION_CONFLICT", 409);
    }
    if (party.status === "archived" && !allowArchived) {
        throw new ContractException("PARTY_ARCHIVED", 409);
    }
    const [updated] = await transaction
        .update(parties)
        .set({
            version: sql`${parties.version} + 1`,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(parties.organizationId, organizationId),
                eq(parties.id, partyId),
                eq(parties.version, expectedVersion),
            ),
        )
        .returning();
    if (!updated) {
        throw new ContractException("VERSION_CONFLICT", 409);
    }
    return updated;
}
