import type { ArdenfoldTransaction } from "@ardenfold/database";
import { receiptCoordinationStateSchema } from "@ardenfold/contracts";
import {
    assetRelationships,
    assets,
    organizationSites,
    parties,
    receiptItems,
    receipts,
    type WorkItem,
    type WorkOrder,
} from "@ardenfold/database/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

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
        const intakes = await tx
            .select({
                id: receipts.id,
                coordination: receipts.coordination,
                custodyStatus: receipts.custodyStatus,
            })
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
                ),
            )
            .orderBy(desc(receipts.receivedAt), desc(receipts.id))
            .limit(1);
        if (!intakes.length) throw new ContractException("WORK_ITEM_INTAKE_REQUIRED", 409);
        for (const intake of intakes) {
            if (intake.custodyStatus === "pending")
                throw new ContractException("WORK_ITEM_INTAKE_CUSTODY_PENDING", 409);
            if (intake.custodyStatus === "not_required") return;
            const state = receiptCoordinationStateSchema.parse(intake.coordination);
            const current = await tx
                .select({ id: assetRelationships.id, kind: assetRelationships.kind })
                .from(assetRelationships)
                .where(
                    and(
                        eq(assetRelationships.organizationId, order.organizationId),
                        eq(assetRelationships.assetId, item.assetId),
                        isNull(assetRelationships.effectiveTo),
                        isNull(assetRelationships.supersededAt),
                    ),
                );
            if (
                (!state.custody ||
                    current.some(
                        (row) => row.kind === "custody" && row.id === state.custodyRelationshipId,
                    )) &&
                (!state.location ||
                    current.some(
                        (row) => row.kind === "location" && row.id === state.locationRelationshipId,
                    ))
            )
                return;
        }
        throw new ContractException("WORK_ITEM_INTAKE_CUSTODY_STALE", 409);
    }
}
