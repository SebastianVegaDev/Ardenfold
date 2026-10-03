import type { ArdenfoldTransaction } from "@ardenfold/database";
import { sql } from "drizzle-orm";

export async function lockMembershipDecision(
    tx: ArdenfoldTransaction,
    organizationId: string,
    userId: string,
) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(
        ${`technical-membership:${organizationId}:${userId}`}, 0))`);
}
