import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    assets,
    organizationSites,
    workItems,
    workOrders,
    type WorkItem,
    type WorkOrder,
} from "@ardenfold/database/schema";
import { and, eq } from "drizzle-orm";

import { ContractException } from "../../../http/contracts";
import { requireWorkItemReady } from "./work-item-readiness";

export type ReadyTechnicalWorkItem = Readonly<{
    order: WorkOrder;
    item: WorkItem;
    siteName: string;
    targetAssetLabel: string | null;
}>;

/**
 * The Service Management handoff is called inside the Technical Operations
 * creation transaction. Lock order then item, matching preparation mutations,
 * so readiness cannot change between this check and execution insertion.
 */
export async function lockReadyTechnicalWorkItem(
    tx: ArdenfoldTransaction,
    organizationId: string,
    workOrderId: string,
    workItemId: string,
    expectedOrderVersion: number,
    expectedItemVersion: number,
): Promise<ReadyTechnicalWorkItem> {
    const [order] = await tx
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.organizationId, organizationId), eq(workOrders.id, workOrderId)))
        .for("update");
    if (!order) throw new ContractException("WORK_ITEM_NOT_FOUND", 404);

    const [item] = await tx
        .select()
        .from(workItems)
        .where(
            and(
                eq(workItems.organizationId, organizationId),
                eq(workItems.workOrderId, workOrderId),
                eq(workItems.id, workItemId),
            ),
        )
        .for("update");
    if (!item) throw new ContractException("WORK_ITEM_NOT_FOUND", 404);
    if (order.version !== expectedOrderVersion || item.version !== expectedItemVersion)
        throw new ContractException("VERSION_CONFLICT", 409);
    if (order.status !== "ready" || item.status !== "ready")
        throw new ContractException("WORK_ITEM_NOT_READY", 409);

    await requireWorkItemReady(tx, order, item);

    const [site] = await tx
        .select({ name: organizationSites.name })
        .from(organizationSites)
        .where(
            and(
                eq(organizationSites.organizationId, organizationId),
                eq(organizationSites.id, order.siteId),
            ),
        )
        .for("share");
    if (!site) throw new ContractException("WORK_ITEM_NOT_READY", 409);

    let targetAssetLabel: string | null = null;
    if (item.assetId) {
        const [asset] = await tx
            .select({ displayName: assets.displayName })
            .from(assets)
            .where(and(eq(assets.organizationId, organizationId), eq(assets.id, item.assetId)))
            .for("share");
        if (!asset) throw new ContractException("WORK_ITEM_NOT_READY", 409);
        targetAssetLabel = asset.displayName;
    }

    return { order, item, siteName: site.name, targetAssetLabel };
}
