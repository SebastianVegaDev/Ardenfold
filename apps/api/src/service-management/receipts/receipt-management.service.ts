import { createHash, randomUUID } from "node:crypto";

import {
    receiptCoordinationStateSchema,
    receiptDetailSchema,
    receiptListResponseSchema,
    type CorrectReceipt,
    type CreateReceipt,
    type ReceiptCoordinationState,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    parties,
    receiptCorrections,
    receiptItems,
    receipts,
    workItems,
    workOrders,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { AssetReferenceService } from "../../assets/queries/asset-reference.service";
import { recordAuditEvent } from "../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";
import {
    advanceWorkOrder,
    lockWorkOrder,
    setWorkChangeReason,
} from "../work-orders/work-order-transaction";
import { CustodyCoordination } from "./custody-coordination";

function digest(input: unknown): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

@Injectable()
export class ReceiptManagementService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly assets: AssetReferenceService,
        private readonly custody: CustodyCoordination,
    ) {}

    get(principal: AuthenticatedPrincipal, organizationId: string, receiptId: string) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["receipts.read"],
            (tx) => this.getInTransaction(tx, organizationId, receiptId),
        );
    }

    list(principal: AuthenticatedPrincipal, organizationId: string, orderId: string) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["receipts.read", "work_orders.read"],
            async (tx) => {
                const [order] = await tx
                    .select({ id: workOrders.id })
                    .from(workOrders)
                    .where(
                        and(
                            eq(workOrders.organizationId, organizationId),
                            eq(workOrders.id, orderId),
                        ),
                    );
                if (!order) throw new ContractException("WORK_ORDER_NOT_FOUND", 404);
                const rows = await tx
                    .select()
                    .from(receipts)
                    .where(
                        and(
                            eq(receipts.organizationId, organizationId),
                            eq(receipts.workOrderId, orderId),
                        ),
                    )
                    .orderBy(asc(receipts.receivedAt), asc(receipts.id));
                return receiptListResponseSchema.parse({
                    data: await Promise.all(rows.map((row) => this.response(tx, row))),
                });
            },
        );
    }

    create(principal: AuthenticatedPrincipal, organizationId: string, input: CreateReceipt) {
        const changesRegistry = !!(input.coordination.custody || input.coordination.location);
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [
                "receipts.write",
                "receipts.read",
                "work_orders.write",
                "work_orders.read",
                "assets.read",
                "parties.read",
                ...(changesRegistry ? ["assets.manage_relationships" as const] : []),
            ],
            async (tx) => {
                const order = await lockWorkOrder(tx, organizationId, input.workOrderId);
                const hash = digest(input);
                const [replay] = await tx
                    .select()
                    .from(receipts)
                    .where(
                        and(
                            eq(receipts.organizationId, organizationId),
                            eq(receipts.idempotencyKey, input.idempotencyKey),
                        ),
                    );
                if (replay) {
                    if (replay.payloadHash !== hash || replay.workOrderId !== order.id)
                        throw new ContractException("IDEMPOTENCY_KEY_CONFLICT", 409);
                    return this.getInTransaction(tx, organizationId, replay.id);
                }
                if (order.version !== input.expectedOrderVersion)
                    throw new ContractException("VERSION_CONFLICT", 409);
                if (order.status === "cancelled")
                    throw new ContractException("WORK_ORDER_CANCELLED", 409);
                const items = await this.requireItems(
                    tx,
                    organizationId,
                    order.id,
                    input.itemIds,
                    input.assetId,
                );
                await this.requireParty(tx, organizationId, input.responsiblePartyId);
                if (input.assetId)
                    await this.assets.requireActiveAsset(tx, organizationId, input.assetId);
                const receiptId = randomUUID();
                const coordination: ReceiptCoordinationState =
                    input.assetId && changesRegistry
                        ? await this.custody.apply(
                              tx,
                              principal,
                              organizationId,
                              input.assetId,
                              input.expectedAssetVersion!,
                              input.receivedAt,
                              input.coordination,
                              receiptId,
                          )
                        : {
                              ...input.coordination,
                              custodyRelationshipId: null,
                              locationRelationshipId: null,
                          };
                const custodyStatus = changesRegistry
                    ? input.assetId
                        ? "applied"
                        : "pending"
                    : "not_required";
                const [created] = await tx
                    .insert(receipts)
                    .values({
                        id: receiptId,
                        organizationId,
                        workOrderId: order.id,
                        assetId: input.assetId,
                        intakeDescription: input.intakeDescription,
                        observedCondition: input.observedCondition,
                        accessories: input.accessories,
                        receivedAt: new Date(input.receivedAt),
                        responsibleActorName: input.responsibleActorName,
                        responsiblePartyId: input.responsiblePartyId,
                        coordination,
                        custodyStatus,
                        idempotencyKey: input.idempotencyKey,
                        payloadHash: hash,
                        recordedByUserId: principal.user.id,
                        updatedByUserId: principal.user.id,
                    })
                    .onConflictDoNothing()
                    .returning();
                if (!created) throw new ContractException("RECEIPT_CONFLICT", 409);
                await tx.insert(receiptItems).values(
                    items.map((item) => ({
                        organizationId,
                        workOrderId: order.id,
                        receiptId: created.id,
                        workItemId: item.id,
                    })),
                );
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "receipt.recorded",
                    resourceType: "receipt",
                    resourceId: created.id,
                    metadata: { workOrderId: order.id, assetId: input.assetId },
                });
                return this.getInTransaction(tx, organizationId, created.id);
            },
        );
    }

    correct(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        receiptId: string,
        input: CorrectReceipt,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [
                "receipts.write",
                "receipts.read",
                "work_orders.write",
                "work_orders.read",
                "assets.read",
                "parties.read",
            ],
            async (tx) => {
                const [existing] = await tx
                    .select()
                    .from(receipts)
                    .where(
                        and(
                            eq(receipts.organizationId, organizationId),
                            eq(receipts.id, receiptId),
                        ),
                    );
                if (!existing) throw new ContractException("RECEIPT_NOT_FOUND", 404);
                const order = await lockWorkOrder(tx, organizationId, existing.workOrderId);
                const hash = digest(input);
                const [replay] = await tx
                    .select()
                    .from(receiptCorrections)
                    .where(
                        and(
                            eq(receiptCorrections.organizationId, organizationId),
                            eq(receiptCorrections.idempotencyKey, input.idempotencyKey),
                        ),
                    );
                if (replay) {
                    if (replay.receiptId !== receiptId || replay.payloadHash !== hash)
                        throw new ContractException("IDEMPOTENCY_KEY_CONFLICT", 409);
                    return this.getInTransaction(tx, organizationId, receiptId);
                }
                const [current] = await tx
                    .select()
                    .from(receipts)
                    .where(
                        and(
                            eq(receipts.organizationId, organizationId),
                            eq(receipts.id, receiptId),
                        ),
                    )
                    .for("update");
                if (!current) throw new ContractException("RECEIPT_NOT_FOUND", 404);
                if (
                    current.version !== input.expectedVersion ||
                    order.version !== input.expectedOrderVersion
                )
                    throw new ContractException("VERSION_CONFLICT", 409);
                if (current.voidedAt) throw new ContractException("RECEIPT_VOIDED", 409);
                const assetId = input.assetId ?? current.assetId;
                if (current.assetId && assetId !== current.assetId)
                    throw new ContractException("RECEIPT_ASSET_REASSIGNMENT_UNSAFE", 409);
                if (assetId) await this.assets.requireActiveAsset(tx, organizationId, assetId);
                await this.requireParty(
                    tx,
                    organizationId,
                    input.responsiblePartyId === undefined
                        ? current.responsiblePartyId
                        : input.responsiblePartyId,
                );
                const previous = receiptCoordinationStateSchema.parse(current.coordination);
                const requested = input.coordination ?? {
                    custody: previous.custody,
                    location: previous.location,
                };
                const needsCoordination = !!(requested.custody || requested.location);
                const receivedAt = input.receivedAt ?? current.receivedAt.toISOString();
                let coordination: ReceiptCoordinationState = previous;
                if ((input.void || !needsCoordination) && current.custodyStatus === "applied") {
                    if (!assetId || !input.expectedAssetVersion)
                        throw new ContractException("ASSET_VERSION_REQUIRED", 400);
                    await this.custody.release(
                        tx,
                        principal,
                        organizationId,
                        assetId,
                        input.expectedAssetVersion,
                        previous,
                        receiptId,
                    );
                    coordination = {
                        ...requested,
                        custodyRelationshipId: null,
                        locationRelationshipId: null,
                    };
                }
                if (!assetId && !input.void)
                    coordination = {
                        ...requested,
                        custodyRelationshipId: null,
                        locationRelationshipId: null,
                    };
                if (
                    !input.void &&
                    assetId &&
                    needsCoordination &&
                    (current.custodyStatus !== "applied" ||
                        JSON.stringify(requested) !==
                            JSON.stringify({
                                custody: previous.custody,
                                location: previous.location,
                            }) ||
                        current.receivedAt.getTime() !== new Date(receivedAt).getTime())
                ) {
                    if (!input.expectedAssetVersion)
                        throw new ContractException("ASSET_VERSION_REQUIRED", 400);
                    coordination = await this.custody.apply(
                        tx,
                        principal,
                        organizationId,
                        assetId,
                        input.expectedAssetVersion,
                        receivedAt,
                        requested,
                        receiptId,
                        current.custodyStatus === "applied" ? previous : undefined,
                        input.reason,
                        current.receivedAt.getTime() !== new Date(receivedAt).getTime(),
                    );
                }
                if (input.void && current.custodyStatus === "pending")
                    coordination = {
                        ...previous,
                        custodyRelationshipId: null,
                        locationRelationshipId: null,
                    };
                const custodyStatus = input.void
                    ? "not_required"
                    : needsCoordination
                      ? assetId
                          ? "applied"
                          : "pending"
                      : "not_required";
                const beforeSnapshot = await this.snapshot(tx, organizationId, receiptId);
                const now = new Date();
                const [updated] = await tx
                    .update(receipts)
                    .set({
                        assetId,
                        intakeDescription: input.intakeDescription ?? current.intakeDescription,
                        observedCondition: input.observedCondition ?? current.observedCondition,
                        accessories: input.accessories ?? current.accessories,
                        receivedAt: new Date(receivedAt),
                        responsibleActorName:
                            input.responsibleActorName ?? current.responsibleActorName,
                        responsiblePartyId:
                            input.responsiblePartyId === undefined
                                ? current.responsiblePartyId
                                : input.responsiblePartyId,
                        coordination,
                        custodyStatus,
                        version: current.version + 1,
                        updatedByUserId: principal.user.id,
                        updatedAt: now,
                        voidedAt: input.void ? now : null,
                        voidedByUserId: input.void ? principal.user.id : null,
                        voidReason: input.void ? input.reason : null,
                    })
                    .where(and(eq(receipts.id, receiptId), eq(receipts.version, current.version)))
                    .returning();
                if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
                const afterSnapshot = await this.snapshot(tx, organizationId, receiptId);
                const kind = input.void
                    ? "voided"
                    : !current.assetId && assetId
                      ? "reconciled"
                      : "corrected";
                await tx.insert(receiptCorrections).values({
                    organizationId,
                    workOrderId: order.id,
                    receiptId,
                    version: updated.version,
                    kind,
                    beforeSnapshot,
                    afterSnapshot,
                    reason: input.reason,
                    idempotencyKey: input.idempotencyKey,
                    payloadHash: hash,
                    correctedByUserId: principal.user.id,
                });
                const links = await tx
                    .select()
                    .from(receiptItems)
                    .where(
                        and(
                            eq(receiptItems.organizationId, organizationId),
                            eq(receiptItems.receiptId, receiptId),
                        ),
                    );
                const linkedItems = await tx
                    .select()
                    .from(workItems)
                    .where(
                        and(
                            eq(workItems.organizationId, organizationId),
                            inArray(
                                workItems.id,
                                links.map((link) => link.workItemId),
                            ),
                        ),
                    );
                if (linkedItems.some((item) => item.assetId && item.assetId !== assetId))
                    throw new ContractException("RECEIPT_ITEM_INELIGIBLE", 409);
                await setWorkChangeReason(tx, input.reason);
                let invalidated = false;
                for (const link of links) {
                    const [item] = await tx
                        .select()
                        .from(workItems)
                        .where(
                            and(
                                eq(workItems.organizationId, organizationId),
                                eq(workItems.id, link.workItemId),
                            ),
                        );
                    if (!item) continue;
                    if (
                        item.status === "ready" &&
                        (input.void ||
                            current.assetId !== assetId ||
                            current.receivedAt.getTime() !== new Date(receivedAt).getTime() ||
                            current.custodyStatus !== custodyStatus ||
                            JSON.stringify(previous) !== JSON.stringify(coordination))
                    ) {
                        await tx
                            .update(workItems)
                            .set({
                                status: "planned",
                                version: item.version + 1,
                                updatedByUserId: principal.user.id,
                                updatedAt: now,
                            })
                            .where(
                                and(eq(workItems.id, item.id), eq(workItems.version, item.version)),
                            );
                        invalidated = true;
                    }
                }
                if (invalidated)
                    await advanceWorkOrder(tx, order, principal.user.id, { status: "planned" });
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: `receipt.${kind}`,
                    resourceType: "receipt",
                    resourceId: receiptId,
                    metadata: { version: updated.version, workOrderId: order.id },
                });
                return this.getInTransaction(tx, organizationId, receiptId);
            },
        );
    }

    private async requireItems(
        tx: ArdenfoldTransaction,
        organizationId: string,
        orderId: string,
        ids: string[],
        assetId: string | null,
    ) {
        const rows = await tx
            .select()
            .from(workItems)
            .where(
                and(
                    eq(workItems.organizationId, organizationId),
                    eq(workItems.workOrderId, orderId),
                    inArray(workItems.id, ids),
                ),
            );
        if (rows.length !== ids.length || new Set(ids).size !== ids.length)
            throw new ContractException("WORK_ITEM_NOT_FOUND", 404);
        if (
            rows.some(
                (item) =>
                    item.status === "cancelled" ||
                    item.serviceMode !== "physical_intake" ||
                    (item.assetId && item.assetId !== assetId),
            )
        )
            throw new ContractException("RECEIPT_ITEM_INELIGIBLE", 409);
        return rows;
    }

    private async requireParty(
        tx: ArdenfoldTransaction,
        organizationId: string,
        partyId: string | null,
    ) {
        if (!partyId) return;
        const [party] = await tx
            .select({ status: parties.status })
            .from(parties)
            .where(and(eq(parties.organizationId, organizationId), eq(parties.id, partyId)));
        if (!party) throw new ContractException("RECEIPT_PARTY_NOT_FOUND", 404);
        if (party.status !== "active") throw new ContractException("RECEIPT_PARTY_ARCHIVED", 409);
    }

    private async snapshot(tx: ArdenfoldTransaction, organizationId: string, receiptId: string) {
        const [row] = await tx
            .select({ value: sql<Record<string, unknown>>`to_jsonb(receipts)` })
            .from(receipts)
            .where(and(eq(receipts.organizationId, organizationId), eq(receipts.id, receiptId)));
        if (!row) throw new ContractException("RECEIPT_NOT_FOUND", 404);
        return row.value;
    }

    private async response(tx: ArdenfoldTransaction, row: typeof receipts.$inferSelect) {
        const links = await tx
            .select({ workItemId: receiptItems.workItemId })
            .from(receiptItems)
            .where(
                and(
                    eq(receiptItems.organizationId, row.organizationId),
                    eq(receiptItems.receiptId, row.id),
                ),
            )
            .orderBy(asc(receiptItems.workItemId));
        return {
            id: row.id,
            workOrderId: row.workOrderId,
            assetId: row.assetId,
            intakeDescription: row.intakeDescription,
            observedCondition: row.observedCondition,
            accessories: row.accessories,
            receivedAt: row.receivedAt.toISOString(),
            responsibleActorName: row.responsibleActorName,
            responsiblePartyId: row.responsiblePartyId,
            coordination: row.coordination,
            custodyStatus: row.custodyStatus,
            version: row.version,
            recordedAt: row.recordedAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            voidedAt: row.voidedAt?.toISOString() ?? null,
            itemIds: links.map((link) => link.workItemId),
        };
    }

    private async getInTransaction(
        tx: ArdenfoldTransaction,
        organizationId: string,
        receiptId: string,
    ) {
        const [row] = await tx
            .select()
            .from(receipts)
            .where(and(eq(receipts.organizationId, organizationId), eq(receipts.id, receiptId)));
        if (!row) throw new ContractException("RECEIPT_NOT_FOUND", 404);
        const corrections = await tx
            .select()
            .from(receiptCorrections)
            .where(
                and(
                    eq(receiptCorrections.organizationId, organizationId),
                    eq(receiptCorrections.receiptId, receiptId),
                ),
            )
            .orderBy(asc(receiptCorrections.version));
        return receiptDetailSchema.parse({
            ...(await this.response(tx, row)),
            corrections: corrections.map((entry) => ({
                id: entry.id,
                version: entry.version,
                kind: entry.kind,
                reason: entry.reason,
                beforeSnapshot: entry.beforeSnapshot,
                afterSnapshot: entry.afterSnapshot,
                correctedByUserId: entry.correctedByUserId,
                correctedAt: entry.correctedAt.toISOString(),
            })),
        });
    }
}
