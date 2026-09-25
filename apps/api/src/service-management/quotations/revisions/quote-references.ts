import type { CreateQuote } from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import { assets, parties } from "@ardenfold/database/schema";
import { and, eq } from "drizzle-orm";

import { ContractException } from "../../../http/contracts";

type Draft = CreateQuote["draft"];

export async function resolveQuoteReferences(
    tx: ArdenfoldTransaction,
    organizationId: string,
    draft: Draft,
) {
    const partySnapshots = new Map<string, Record<string, string | null>>();
    const assetSnapshots = new Map<string, Record<string, string | null>>();
    for (const partyId of new Set(
        draft.lines.flatMap((line) => (line.partyId ? [line.partyId] : [])),
    )) {
        const [party] = await tx
            .select({
                id: parties.id,
                status: parties.status,
                displayName: parties.displayName,
                legalName: parties.legalName,
            })
            .from(parties)
            .where(and(eq(parties.organizationId, organizationId), eq(parties.id, partyId)))
            .for("share");
        if (!party || party.status !== "active")
            throw new ContractException("QUOTE_REFERENCE_NOT_FOUND", 404);
        partySnapshots.set(partyId, {
            id: party.id,
            displayName: party.displayName,
            legalName: party.legalName,
        });
    }
    for (const assetId of new Set(
        draft.lines.flatMap((line) => (line.assetId ? [line.assetId] : [])),
    )) {
        const [asset] = await tx
            .select({
                id: assets.id,
                status: assets.status,
                displayName: assets.displayName,
                manufacturer: assets.manufacturer,
                model: assets.model,
            })
            .from(assets)
            .where(and(eq(assets.organizationId, organizationId), eq(assets.id, assetId)))
            .for("share");
        if (!asset || asset.status !== "active")
            throw new ContractException("QUOTE_REFERENCE_NOT_FOUND", 404);
        assetSnapshots.set(assetId, {
            id: asset.id,
            displayName: asset.displayName,
            manufacturer: asset.manufacturer,
            model: asset.model,
        });
    }
    return { partySnapshots, assetSnapshots };
}
