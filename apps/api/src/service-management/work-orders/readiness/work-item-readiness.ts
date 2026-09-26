import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    assets,
    organizationSites,
    parties,
    receiptItems,
    receipts,
    type WorkItem,
    type WorkOrder,
} from "@ardenfold/database/schema";
import { and, eq, isNull, ne } from "drizzle-orm";

import { ContractException } from "../../../http/contracts";

export async function requireWorkItemReady(
    tx: ArdenfoldTransaction,
    order: WorkOrder,
    item: WorkItem,
): Promise<void> {
    if (order.status === "cancelled" || item.status === "cancelled")
        throw new ContractException("WORK_ITEM_CANCELLED", 409);
    const [site] = await tx
        .select({ isActive: organizationSites.isActive })
        .from(organizationSites)
        .where(
            and(
                eq(organizationSites.organizationId, order.organizationId),
                eq(organizationSites.id, order.siteId),
            ),
        )
        .for("share");
    if (!site?.isActive) throw new ContractException("WORK_SITE_INACTIVE", 409);
    if (item.partyId) {
        const [party] = await tx
            .select({ status: parties.status })
            .from(parties)
            .where(
                and(eq(parties.organizationId, order.organizationId), eq(parties.id, item.partyId)),
            )
            .for("share");
        if (!party || party.status !== "active")
            throw new ContractException("WORK_ITEM_PARTY_UNAVAILABLE", 409);
    }
    if (item.assetRequirement === "required") {
        if (!item.assetId) throw new ContractException("WORK_ITEM_ASSET_UNRESOLVED", 409);
        const [asset] = await tx
            .select({ status: assets.status })
            .from(assets)
            .where(
                and(eq(assets.organizationId, order.organizationId), eq(assets.id, item.assetId)),
            )
            .for("share");
        if (!asset || asset.status !== "active")
            throw new ContractException("WORK_ITEM_ASSET_UNAVAILABLE", 409);
    }
    if (item.serviceMode === "physical_intake") {
        if (!item.assetId) throw new ContractException("WORK_ITEM_ASSET_UNRESOLVED", 409);
        const [validIntake] = await tx
            .select({ id: receipts.id })
            .from(receiptItems)
            .innerJoin(
                receipts,
                and(
                    eq(receipts.organizationId, receiptItems.organizationId),
                    eq(receipts.workOrderId, receiptItems.workOrderId),
                    eq(receipts.id, receiptItems.receiptId),
                ),
            )
            .where(
                and(
                    eq(receiptItems.organizationId, order.organizationId),
                    eq(receiptItems.workOrderId, order.id),
                    eq(receiptItems.workItemId, item.id),
                    eq(receipts.assetId, item.assetId),
                    isNull(receipts.voidedAt),
                    ne(receipts.custodyStatus, "pending"),
                ),
            )
            .limit(1);
        if (!validIntake) throw new ContractException("WORK_ITEM_INTAKE_REQUIRED", 409);
    }
}
