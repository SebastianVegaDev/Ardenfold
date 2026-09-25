import type { ArdenfoldTransaction } from "@ardenfold/database";
import { assets } from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { ContractException } from "../../http/contracts";

@Injectable()
export class AssetReferenceService {
    async requireActiveAsset(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        assetId: string,
    ): Promise<void> {
        const [asset] = await transaction
            .select({ status: assets.status })
            .from(assets)
            .where(and(eq(assets.organizationId, organizationId), eq(assets.id, assetId)))
            .for("share");
        if (!asset) throw new ContractException("REQUESTED_ASSET_NOT_FOUND", 404);
        if (asset.status !== "active") throw new ContractException("REQUESTED_ASSET_ARCHIVED", 409);
    }
}
