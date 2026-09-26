import { createHash } from "node:crypto";

import type {
    CreateWorkOrder,
    PermissionCode,
    UpdateWorkOrder,
    WorkOrderTransition,
} from "@ardenfold/contracts";
import {
    parties,
    quoteAcceptances,
    quoteRevisionLines,
    quoteRevisions,
    workItems,
    workOrders,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";

import { AssetReferenceService } from "../../../assets/queries/asset-reference.service";
import { recordAuditEvent } from "../../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { SiteManagementService } from "../../../auth/organizations/site-management.service";
import { ContractException } from "../../../http/contracts";
import { PartyReferenceService } from "../../../parties/queries/party-reference.service";
import { lockQuote } from "../../quotations/quote-transaction";
import { advanceWorkOrder, lockWorkOrder, setWorkChangeReason } from "../work-order-transaction";
import { WorkOrderQueriesService } from "../queries/work-order-queries.service";
import { requireWorkItemReady } from "../readiness/work-item-readiness";

const Exact = Decimal.clone({ precision: 60 });

@Injectable()
export class WorkOrderManagementService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly sites: SiteManagementService,
        private readonly parties: PartyReferenceService,
        private readonly assets: AssetReferenceService,
        private readonly queries: WorkOrderQueriesService,
    ) {}

    create(principal: AuthenticatedPrincipal, organizationId: string, input: CreateWorkOrder) {
        const required: PermissionCode[] = [
            "work_orders.write",
            "work_orders.read",
            "quotations.read",
            "service_requests.read",
            "parties.read",
            "sites.read",
        ];
        if (input.items.some((item) => item.assetId)) required.push("assets.read");
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            required,
            async (tx) => {
                const { quote, request } = await lockQuote(tx, organizationId, input.quoteId);
                const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
                const [replay] = await tx
                    .select()
                    .from(workOrders)
                    .where(
                        and(
                            eq(workOrders.organizationId, organizationId),
                            eq(workOrders.idempotencyKey, input.idempotencyKey),
                        ),
                    );
                if (replay) {
                    if (replay.quoteId !== input.quoteId || replay.payloadHash !== hash)
                        throw new ContractException("IDEMPOTENCY_KEY_CONFLICT", 409);
                    return this.queries.getInTransaction(tx, organizationId, replay.id);
                }
                if (
                    quote.version !== input.expectedQuoteVersion ||
                    request.version !== input.expectedRequestVersion
                )
                    throw new ContractException("VERSION_CONFLICT", 409);
                if (request.status !== "active" || quote.status !== "accepted")
                    throw new ContractException("WORK_ORDER_BASIS_NOT_ACCEPTED", 409);
                const [acceptance] = await tx
                    .select()
                    .from(quoteAcceptances)
                    .where(
                        and(
                            eq(quoteAcceptances.organizationId, organizationId),
                            eq(quoteAcceptances.quoteId, quote.id),
                            eq(quoteAcceptances.id, input.acceptanceId),
                            eq(quoteAcceptances.revisionId, input.acceptedRevisionId),
                        ),
                    );
                const [revision] = await tx
                    .select()
                    .from(quoteRevisions)
                    .where(
                        and(
                            eq(quoteRevisions.organizationId, organizationId),
                            eq(quoteRevisions.quoteId, quote.id),
                            eq(quoteRevisions.id, input.acceptedRevisionId),
                        ),
                    );
                if (
                    !acceptance ||
                    acceptance.withdrawnAt ||
                    !revision ||
                    revision.status !== "accepted"
                )
                    throw new ContractException("WORK_ORDER_BASIS_NOT_ACCEPTED", 409);
                const [existing] = await tx
                    .select({ id: workOrders.id })
                    .from(workOrders)
                    .where(
                        and(
                            eq(workOrders.organizationId, organizationId),
                            eq(workOrders.acceptanceId, acceptance.id),
                        ),
                    );
                if (existing) throw new ContractException("WORK_ORDER_ALREADY_AUTHORIZED", 409);
                await this.parties.requireActiveCustomer(
                    tx,
                    organizationId,
                    quote.customerPartyId,
                    null,
                );
                await this.sites.requireActiveSite(tx, organizationId, input.siteId);
                const lines = await tx
                    .select()
                    .from(quoteRevisionLines)
                    .where(
                        and(
                            eq(quoteRevisionLines.organizationId, organizationId),
                            eq(quoteRevisionLines.revisionId, revision.id),
                        ),
                    )
                    .orderBy(quoteRevisionLines.position);
                if (!lines.length)
                    throw new ContractException("WORK_ORDER_ALLOCATION_INVALID", 400);
                const byLine = new Map(lines.map((line) => [line.id, line]));
                const sums = new Map<string, Decimal>();
                for (const item of input.items) {
                    const line = byLine.get(item.sourceRevisionLineId);
                    if (
                        !line ||
                        line.unit !== item.allocatedUnit ||
                        (line.assetId && item.assetId !== line.assetId) ||
                        (line.partyId && item.partyId !== line.partyId)
                    )
                        throw new ContractException("WORK_ORDER_ALLOCATION_INVALID", 400);
                    sums.set(
                        line.id,
                        (sums.get(line.id) ?? new Exact(0)).plus(item.allocatedQuantity),
                    );
                    if (item.assetId)
                        await this.assets.requireActiveAsset(tx, organizationId, item.assetId);
                    if (item.partyId) {
                        const [party] = await tx
                            .select({ status: parties.status })
                            .from(parties)
                            .where(
                                and(
                                    eq(parties.organizationId, organizationId),
                                    eq(parties.id, item.partyId),
                                ),
                            )
                            .for("share");
                        if (!party) throw new ContractException("WORK_ITEM_PARTY_NOT_FOUND", 404);
                        if (party.status !== "active")
                            throw new ContractException("WORK_ITEM_PARTY_ARCHIVED", 409);
                    }
                }
                if (lines.some((line) => !sums.get(line.id)?.eq(new Exact(line.quantity))))
                    throw new ContractException("WORK_ORDER_ALLOCATION_INVALID", 400);
                const snapshot = {
                    acceptedRevisionId: revision.id,
                    lines: lines.map((line) => ({
                        lineId: line.id,
                        quantity: line.quantity,
                        unit: line.unit,
                        itemNumbers: input.items.flatMap((item, index) =>
                            item.sourceRevisionLineId === line.id ? [index + 1] : [],
                        ),
                    })),
                };
                const [order] = await tx
                    .insert(workOrders)
                    .values({
                        organizationId,
                        requestId: request.id,
                        customerPartyId: quote.customerPartyId,
                        quoteId: quote.id,
                        acceptanceId: acceptance.id,
                        acceptedRevisionId: revision.id,
                        siteId: input.siteId,
                        reference: input.reference,
                        nextItemNumber: input.items.length + 1,
                        initialAllocationSnapshot: snapshot,
                        idempotencyKey: input.idempotencyKey,
                        payloadHash: hash,
                        createdByUserId: principal.user.id,
                        authorizedByUserId: principal.user.id,
                        updatedByUserId: principal.user.id,
                    })
                    .onConflictDoNothing()
                    .returning();
                if (!order) throw new ContractException("WORK_ORDER_CONFLICT", 409);
                await tx.insert(workItems).values(
                    input.items.map((item, index) => ({
                        organizationId,
                        workOrderId: order.id,
                        acceptedRevisionId: revision.id,
                        sourceRevisionLineId: item.sourceRevisionLineId,
                        itemNumber: index + 1,
                        scopeDescription: item.scopeDescription,
                        allocatedQuantity: item.allocatedQuantity,
                        allocatedUnit: item.allocatedUnit,
                        partyId: item.partyId,
                        assetRequirement: item.assetRequirement,
                        assetId: item.assetId,
                        unresolvedAssetDescription: item.unresolvedAssetDescription,
                        serviceMode: item.serviceMode,
                        createdByUserId: principal.user.id,
                        updatedByUserId: principal.user.id,
                    })),
                );
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "work_order.authorized",
                    resourceType: "work_order",
                    resourceId: order.id,
                    metadata: {
                        quoteId: quote.id,
                        acceptanceId: acceptance.id,
                        revisionId: revision.id,
                    },
                });
                return this.queries.getInTransaction(tx, organizationId, order.id);
            },
        );
    }

    update(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        orderId: string,
        input: UpdateWorkOrder,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["work_orders.write", "work_orders.read", "sites.read"],
            async (tx) => {
                const order = await lockWorkOrder(
                    tx,
                    organizationId,
                    orderId,
                    input.expectedVersion,
                );
                if (order.status === "cancelled")
                    throw new ContractException("WORK_ORDER_CANCELLED", 409);
                if (input.siteId)
                    await this.sites.requireActiveSite(tx, organizationId, input.siteId);
                await setWorkChangeReason(tx, input.reason);
                if (input.siteId && input.siteId !== order.siteId) {
                    const readyItems = await tx
                        .select()
                        .from(workItems)
                        .where(
                            and(
                                eq(workItems.organizationId, organizationId),
                                eq(workItems.workOrderId, order.id),
                                eq(workItems.status, "ready"),
                            ),
                        );
                    for (const item of readyItems) {
                        await tx
                            .update(workItems)
                            .set({
                                status: "planned",
                                version: item.version + 1,
                                updatedByUserId: principal.user.id,
                                updatedAt: new Date(),
                            })
                            .where(
                                and(eq(workItems.id, item.id), eq(workItems.version, item.version)),
                            );
                    }
                }
                const updated = await advanceWorkOrder(tx, order, principal.user.id, {
                    siteId: input.siteId ?? order.siteId,
                    preparationNotes:
                        input.preparationNotes === undefined
                            ? order.preparationNotes
                            : input.preparationNotes,
                    status:
                        input.siteId && input.siteId !== order.siteId ? "planned" : order.status,
                });
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "work_order.prepared",
                    resourceType: "work_order",
                    resourceId: order.id,
                    metadata: { version: updated.version },
                });
                return this.queries.getInTransaction(tx, organizationId, order.id);
            },
        );
    }

    cancel(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        orderId: string,
        input: WorkOrderTransition,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["work_orders.write", "work_orders.read"],
            async (tx) => {
                const order = await lockWorkOrder(
                    tx,
                    organizationId,
                    orderId,
                    input.expectedVersion,
                );
                if (order.status === "cancelled")
                    throw new ContractException("WORK_ORDER_CANCELLED", 409);
                await setWorkChangeReason(tx, input.reason);
                const now = new Date();
                const items = await tx
                    .select()
                    .from(workItems)
                    .where(
                        and(
                            eq(workItems.organizationId, organizationId),
                            eq(workItems.workOrderId, order.id),
                        ),
                    );
                for (const item of items.filter((row) => row.status !== "cancelled")) {
                    await tx
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
                        .where(and(eq(workItems.id, item.id), eq(workItems.version, item.version)));
                }
                const updated = await advanceWorkOrder(tx, order, principal.user.id, {
                    status: "cancelled",
                    cancelledAt: now,
                    cancelledByUserId: principal.user.id,
                    cancellationReason: input.reason,
                });
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "work_order.cancelled",
                    resourceType: "work_order",
                    resourceId: order.id,
                    metadata: { version: updated.version },
                });
                return this.queries.getInTransaction(tx, organizationId, order.id);
            },
        );
    }

    transitionReadiness(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        orderId: string,
        target: "planned" | "ready",
        input: WorkOrderTransition,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["work_orders.write", "work_orders.read", "sites.read", "parties.read", "assets.read"],
            async (tx) => {
                const order = await lockWorkOrder(
                    tx,
                    organizationId,
                    orderId,
                    input.expectedVersion,
                );
                if (order.status === "cancelled")
                    throw new ContractException("WORK_ORDER_CANCELLED", 409);
                if (order.status === target)
                    throw new ContractException("WORK_ORDER_TRANSITION_INVALID", 409);
                if (target === "ready") {
                    const items = await tx
                        .select()
                        .from(workItems)
                        .where(
                            and(
                                eq(workItems.organizationId, organizationId),
                                eq(workItems.workOrderId, order.id),
                            ),
                        );
                    const active = items.filter((item) => item.status !== "cancelled");
                    if (!active.length || active.some((item) => item.status !== "ready"))
                        throw new ContractException("WORK_ORDER_ITEMS_NOT_READY", 409);
                    for (const item of active) await requireWorkItemReady(tx, order, item);
                }
                await setWorkChangeReason(tx, input.reason);
                const updated = await advanceWorkOrder(tx, order, principal.user.id, {
                    status: target,
                });
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: `work_order.${target}`,
                    resourceType: "work_order",
                    resourceId: order.id,
                    metadata: { version: updated.version },
                });
                return this.queries.getInTransaction(tx, organizationId, order.id);
            },
        );
    }
}
