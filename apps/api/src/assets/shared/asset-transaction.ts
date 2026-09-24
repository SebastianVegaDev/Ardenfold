import type { ArdenfoldTransaction } from "@ardenfold/database";
import { assets, type Asset } from "@ardenfold/database/schema";
import { and, eq, sql } from "drizzle-orm";

import { ContractException } from "../../http/contracts";

export async function getAsset(
    transaction: ArdenfoldTransaction,
    organizationId: string,
    assetId: string,
): Promise<Asset> {
    const [asset] = await transaction
        .select()
        .from(assets)
        .where(and(eq(assets.organizationId, organizationId), eq(assets.id, assetId)));
    if (!asset) throw new ContractException("ASSET_NOT_FOUND", 404);
    return asset;
}

export async function advanceAssetVersion(
    transaction: ArdenfoldTransaction,
    organizationId: string,
    assetId: string,
    expectedVersion: number,
): Promise<Asset> {
    const asset = await getAsset(transaction, organizationId, assetId);
    if (asset.version !== expectedVersion) throw new ContractException("VERSION_CONFLICT", 409);
    if (asset.status === "archived") throw new ContractException("ASSET_ARCHIVED", 409);
    const [updated] = await transaction
        .update(assets)
        .set({ version: sql`${assets.version} + 1`, updatedAt: new Date() })
        .where(
            and(
                eq(assets.organizationId, organizationId),
                eq(assets.id, assetId),
                eq(assets.version, expectedVersion),
            ),
        )
        .returning();
    if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
    return updated;
}
