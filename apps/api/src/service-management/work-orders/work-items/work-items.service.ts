import type {
    PermissionCode,
    RestructureWorkItem,
    UpdateWorkItem,
    WorkItemAllocation,
    WorkItemTransition,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    assets,
    parties,
    quoteRevisionLines,
    workItems,
    type WorkItem,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";

import { recordAuditEvent } from "../../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";
import { WorkOrderQueriesService } from "../queries/work-order-queries.service";
import { requireWorkItemReady } from "../readiness/work-item-readiness";
import { advanceWorkOrder, lockWorkOrder, setWorkChangeReason } from "../work-order-transaction";

const Exact = Decimal.clone({ precision: 60 });

async function lockItem(
    tx: ArdenfoldTransaction,
    organizationId: string,
    orderId: string,
    itemId: string,
    expectedVersion: number,
): Promise<WorkItem> {
    const [item] = await tx
        .select()
        .from(workItems)
        .where(
            and(
                eq(workItems.organizationId, organizationId),
                eq(workItems.workOrderId, orderId),
                eq(workItems.id, itemId),
            ),
        )
        .for("update");
    if (!item) throw new ContractException("WORK_ITEM_NOT_FOUND", 404);
    if (item.version !== expectedVersion) throw new ContractException("VERSION_CONFLICT", 409);
    return item;
}

async function validateReferences(
    tx: ArdenfoldTransaction,
    organizationId: string,
    input: Pick<
        WorkItemAllocation,
        "assetRequirement" | "assetId" | "unresolvedAssetDescription" | "partyId" | "serviceMode"
    >,
): Promise<void> {
    if (input.assetRequirement === "not_applicable") {
        if (input.assetId || input.unresolvedAssetDescription || input.serviceMode !== "no_intake")
            throw new ContractException("WORK_ITEM_ASSET_STATE_INVALID", 400);
    } else if (!input.assetId && !input.unresolvedAssetDescription) {
        throw new ContractException("WORK_ITEM_ASSET_STATE_INVALID", 400);
    }
    if (input.assetId) {
        const [asset] = await tx
            .select({ status: assets.status })
            .from(assets)
            .where(and(eq(assets.organizationId, organizationId), eq(assets.id, input.assetId)))
            .for("share");
        if (!asset) throw new ContractException("WORK_ITEM_ASSET_NOT_FOUND", 404);
        if (asset.status !== "active") throw new ContractException("WORK_ITEM_ASSET_ARCHIVED", 409);
    }
    if (input.partyId) {
        const [party] = await tx
            .select({ status: parties.status })
            .from(parties)
            .where(and(eq(parties.organizationId, organizationId), eq(parties.id, input.partyId)))
            .for("share");
        if (!party) throw new ContractException("WORK_ITEM_PARTY_NOT_FOUND", 404);
        if (party.status !== "active") throw new ContractException("WORK_ITEM_PARTY_ARCHIVED", 409);
    }
}

@Injectable()
export class WorkItemsService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly queries: WorkOrderQueriesService,
    ) {}

    update(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        orderId: string,
        itemId: string,
        input: UpdateWorkItem,
    ) {
        const required: PermissionCode[] = [
            "work_orders.write",
            "work_orders.read",
            "assets.read",
            "parties.read",
        ];
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            required,
            async (tx) => {
                const order = await lockWorkOrder(
                    tx,
                    organizationId,
                    orderId,
                    input.expectedOrderVersion,
                );
                const item = await lockItem(
                    tx,
                    organizationId,
                    orderId,
                    itemId,
                    input.expectedItemVersion,
                );
                if (order.status === "cancelled" || item.status === "cancelled")
                    throw new ContractException("WORK_ITEM_CANCELLED", 409);
                const changes = {
                    scopeDescription: input.scopeDescription ?? item.scopeDescription,
                    partyId: input.partyId === undefined ? item.partyId : input.partyId,
                    assetId: input.assetId === undefined ? item.assetId : input.assetId,
                    unresolvedAssetDescription:
                        input.unresolvedAssetDescription === undefined
                            ? item.unresolvedAssetDescription
                            : input.unresolvedAssetDescription,
                    serviceMode: input.serviceMode ?? item.serviceMode,
                    preparationNotes:
                        input.preparationNotes === undefined
                            ? item.preparationNotes
                            : input.preparationNotes,
                };
                await validateReferences(tx, organizationId, {
                    ...changes,
                    assetRequirement: item.assetRequirement,
                });
                await setWorkChangeReason(tx, input.reason);
                const [updated] = await tx
                    .update(workItems)
                    .set({
                        ...changes,
                        status: item.status === "ready" ? "planned" : item.status,
                        version: item.version + 1,
                        updatedByUserId: principal.user.id,
                        updatedAt: new Date(),
                    })
                    .where(and(eq(workItems.id, item.id), eq(workItems.version, item.version)))
                    .returning();
                if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
                await advanceWorkOrder(tx, order, principal.user.id, {
                    status: order.status === "ready" ? "planned" : order.status,
                });
                await this.audit(
                    tx,
                    principal,
                    organizationId,
                    item.id,
                    "prepared",
                    updated.version,
                );
                return this.queries.getInTransaction(tx, organizationId, orderId);
            },
        );
    }

    transition(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        orderId: string,
        itemId: string,
        target: "planned" | "ready" | "cancelled",
        input: WorkItemTransition,
    ) {
        const required: PermissionCode[] = ["work_orders.write", "work_orders.read"];
        if (target === "ready") required.push("sites.read", "parties.read", "assets.read");
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            required,
            async (tx) => {
                const order = await lockWorkOrder(
                    tx,
                    organizationId,
                    orderId,
                    input.expectedOrderVersion,
                );
                const item = await lockItem(
                    tx,
                    organizationId,
                    orderId,
                    itemId,
                    input.expectedItemVersion,
                );
                if (order.status === "cancelled" || item.status === "cancelled")
                    throw new ContractException("WORK_ITEM_CANCELLED", 409);
                if (item.status === target)
                    throw new ContractException("WORK_ITEM_TRANSITION_INVALID", 409);
                if (target === "ready") await requireWorkItemReady(tx, order, item);
                await setWorkChangeReason(tx, input.reason);
                const now = new Date();
                const [updated] = await tx
                    .update(workItems)
                    .set({
                        status: target,
                        version: item.version + 1,
                        updatedAt: now,
                        updatedByUserId: principal.user.id,
                        cancelledAt: target === "cancelled" ? now : null,
                        cancelledByUserId: target === "cancelled" ? principal.user.id : null,
                        cancellationReason: target === "cancelled" ? input.reason : null,
                    })
                    .where(and(eq(workItems.id, item.id), eq(workItems.version, item.version)))
                    .returning();
                if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
                const remaining =
                    target === "cancelled"
                        ? await tx
                              .select({ id: workItems.id })
                              .from(workItems)
                              .where(
                                  and(
                                      eq(workItems.organizationId, organizationId),
                                      eq(workItems.workOrderId, orderId),
                                      eq(workItems.status, "planned"),
                                  ),
                              )
                        : [];
                const ready =
                    target === "cancelled"
                        ? await tx
                              .select({ id: workItems.id })
                              .from(workItems)
                              .where(
                                  and(
                                      eq(workItems.organizationId, organizationId),
                                      eq(workItems.workOrderId, orderId),
                                      eq(workItems.status, "ready"),
                                  ),
                              )
                        : [];
                const cancelOrder = target === "cancelled" && remaining.length + ready.length === 0;
                await advanceWorkOrder(tx, order, principal.user.id, {
                    status: cancelOrder
                        ? "cancelled"
                        : order.status === "ready"
                          ? "planned"
                          : order.status,
                    cancelledAt: cancelOrder ? now : null,
                    cancelledByUserId: cancelOrder ? principal.user.id : null,
                    cancellationReason: cancelOrder ? input.reason : null,
                });
                await this.audit(tx, principal, organizationId, item.id, target, updated.version);
                return this.queries.getInTransaction(tx, organizationId, orderId);
            },
        );
    }

    restructure(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        orderId: string,
        itemId: string,
        input: RestructureWorkItem,
    ) {
        const required: PermissionCode[] = [
            "work_orders.write",
            "work_orders.read",
            "quotations.read",
        ];
        if (input.replacements.some((item) => item.assetId)) required.push("assets.read");
        if (input.replacements.some((item) => item.partyId)) required.push("parties.read");
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            required,
            async (tx) => {
                const order = await lockWorkOrder(
                    tx,
                    organizationId,
                    orderId,
                    input.expectedOrderVersion,
                );
                const item = await lockItem(
                    tx,
                    organizationId,
                    orderId,
                    itemId,
                    input.expectedItemVersion,
                );
                if (order.status !== "planned" || item.status !== "planned")
                    throw new ContractException("WORK_ITEM_RESTRUCTURE_INVALID", 409);
                const [line] = await tx
                    .select()
                    .from(quoteRevisionLines)
                    .where(
                        and(
                            eq(quoteRevisionLines.organizationId, organizationId),
                            eq(quoteRevisionLines.revisionId, order.acceptedRevisionId),
                            eq(quoteRevisionLines.id, item.sourceRevisionLineId),
                        ),
                    );
                if (
                    !line ||
                    input.replacements.some(
                        (replacement) =>
                            replacement.sourceRevisionLineId !== item.sourceRevisionLineId ||
                            replacement.allocatedUnit !== item.allocatedUnit ||
                            (line.assetId && replacement.assetId !== line.assetId) ||
                            (line.partyId && replacement.partyId !== line.partyId),
                    ) ||
                    !input.replacements
                        .reduce(
                            (sum, replacement) => sum.plus(replacement.allocatedQuantity),
                            new Exact(0),
                        )
                        .eq(item.allocatedQuantity)
                )
                    throw new ContractException("WORK_ITEM_RESTRUCTURE_INVALID", 400);
                for (const replacement of input.replacements)
                    await validateReferences(tx, organizationId, replacement);
                await setWorkChangeReason(tx, input.reason);
                const now = new Date();
                const [cancelled] = await tx
                    .update(workItems)
                    .set({
                        status: "cancelled",
                        version: item.version + 1,
                        updatedAt: now,
                        updatedByUserId: principal.user.id,
                        cancelledAt: now,
                        cancelledByUserId: principal.user.id,
                        cancellationReason: input.reason,
                    })
                    .where(and(eq(workItems.id, item.id), eq(workItems.version, item.version)))
                    .returning();
                if (!cancelled) throw new ContractException("VERSION_CONFLICT", 409);
                await tx.insert(workItems).values(
                    input.replacements.map((replacement, index) => ({
                        organizationId,
                        workOrderId: order.id,
                        acceptedRevisionId: order.acceptedRevisionId,
                        sourceRevisionLineId: item.sourceRevisionLineId,
                        itemNumber: order.nextItemNumber + index,
                        replacesItemId: item.id,
                        scopeDescription: replacement.scopeDescription,
                        allocatedQuantity: replacement.allocatedQuantity,
                        allocatedUnit: replacement.allocatedUnit,
                        partyId: replacement.partyId,
                        assetRequirement: replacement.assetRequirement,
                        assetId: replacement.assetId,
                        unresolvedAssetDescription: replacement.unresolvedAssetDescription,
                        serviceMode: replacement.serviceMode,
                        createdByUserId: principal.user.id,
                        updatedByUserId: principal.user.id,
                    })),
                );
                const updated = await advanceWorkOrder(tx, order, principal.user.id, {
                    nextItemNumber: order.nextItemNumber + input.replacements.length,
                });
                await this.audit(
                    tx,
                    principal,
                    organizationId,
                    item.id,
                    "restructured",
                    updated.version,
                );
                return this.queries.getInTransaction(tx, organizationId, orderId);
            },
        );
    }

    private async audit(
        tx: ArdenfoldTransaction,
        principal: AuthenticatedPrincipal,
        organizationId: string,
        itemId: string,
        kind: "prepared" | "ready" | "planned" | "cancelled" | "restructured",
        version: number,
    ): Promise<void> {
        await recordAuditEvent(tx, {
            organizationId,
            actorUserId: principal.user.id,
            action: `work_item.${kind}`,
            resourceType: "work_item",
            resourceId: itemId,
            metadata: { version },
        });
    }
}
