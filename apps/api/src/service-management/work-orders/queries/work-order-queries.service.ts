import {
    workItemReadinessBlockerSchema,
    workOrderDetailSchema,
    workOrderListResponseSchema,
    workOrderReadinessResponseSchema,
    workOrderSummarySchema,
    type WorkOrderDetail,
    type WorkOrderListQuery,
    type WorkOrderListResponse,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    workItemHistoryEntries,
    workItems,
    workOrderHistoryEntries,
    workOrders,
    type WorkOrder,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, getTableColumns, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../../http/contracts";
import { requireWorkItemReady } from "../readiness/work-item-readiness";

const cursorSchema = z.strictObject({
    createdAt: z.iso.datetime({ precision: 6 }),
    id: z.uuid(),
    status: z.string().nullable(),
    requestId: z.uuid().nullable(),
    siteId: z.uuid().nullable(),
});

function summary(row: WorkOrder) {
    return workOrderSummarySchema.parse({
        id: row.id,
        requestId: row.requestId,
        quoteId: row.quoteId,
        acceptanceId: row.acceptanceId,
        acceptedRevisionId: row.acceptedRevisionId,
        customerPartyId: row.customerPartyId,
        siteId: row.siteId,
        reference: row.reference,
        status: row.status,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    });
}

@Injectable()
export class WorkOrderQueriesService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    get(principal: AuthenticatedPrincipal, organizationId: string, orderId: string) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["work_orders.read"],
            (tx) => this.getInTransaction(tx, organizationId, orderId),
        );
    }

    readiness(principal: AuthenticatedPrincipal, organizationId: string, orderId: string) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["work_orders.read", "sites.read", "parties.read", "assets.read", "receipts.read"],
            async (tx) => {
                const [order] = await tx
                    .select()
                    .from(workOrders)
                    .where(
                        and(
                            eq(workOrders.organizationId, organizationId),
                            eq(workOrders.id, orderId),
                        ),
                    );
                if (!order) throw new ContractException("WORK_ORDER_NOT_FOUND", 404);
                const items = await tx
                    .select()
                    .from(workItems)
                    .where(
                        and(
                            eq(workItems.organizationId, organizationId),
                            eq(workItems.workOrderId, orderId),
                        ),
                    )
                    .orderBy(workItems.itemNumber);
                const data = [];
                for (const item of items) {
                    let blocker: string | null = null;
                    try {
                        await requireWorkItemReady(tx, order, item);
                    } catch (error) {
                        if (
                            !(error instanceof ContractException) ||
                            !workItemReadinessBlockerSchema.safeParse(error.code).success
                        )
                            throw error;
                        blocker = error.code;
                    }
                    data.push({ itemId: item.id, blocker });
                }
                return workOrderReadinessResponseSchema.parse({ data });
            },
        );
    }

    async getInTransaction(
        tx: ArdenfoldTransaction,
        organizationId: string,
        orderId: string,
    ): Promise<WorkOrderDetail> {
        const [order] = await tx
            .select()
            .from(workOrders)
            .where(and(eq(workOrders.organizationId, organizationId), eq(workOrders.id, orderId)));
        if (!order) throw new ContractException("WORK_ORDER_NOT_FOUND", 404);
        const items = await tx
            .select()
            .from(workItems)
            .where(
                and(
                    eq(workItems.organizationId, organizationId),
                    eq(workItems.workOrderId, orderId),
                ),
            )
            .orderBy(workItems.itemNumber);
        const history = await tx
            .select()
            .from(workOrderHistoryEntries)
            .where(
                and(
                    eq(workOrderHistoryEntries.organizationId, organizationId),
                    eq(workOrderHistoryEntries.workOrderId, orderId),
                ),
            )
            .orderBy(workOrderHistoryEntries.version);
        const itemHistory = await tx
            .select()
            .from(workItemHistoryEntries)
            .where(
                and(
                    eq(workItemHistoryEntries.organizationId, organizationId),
                    eq(workItemHistoryEntries.workOrderId, orderId),
                ),
            )
            .orderBy(workItemHistoryEntries.workItemId, workItemHistoryEntries.version);
        return workOrderDetailSchema.parse({
            ...summary(order),
            initialAllocationSnapshot: order.initialAllocationSnapshot,
            preparationNotes: order.preparationNotes,
            cancelledAt: order.cancelledAt?.toISOString() ?? null,
            cancellationReason: order.cancellationReason,
            items: items.map((item) => ({
                id: item.id,
                workOrderId: item.workOrderId,
                itemNumber: item.itemNumber,
                replacesItemId: item.replacesItemId,
                sourceRevisionLineId: item.sourceRevisionLineId,
                scopeDescription: item.scopeDescription,
                allocatedQuantity: item.allocatedQuantity,
                allocatedUnit: item.allocatedUnit,
                partyId: item.partyId,
                assetRequirement: item.assetRequirement,
                assetId: item.assetId,
                unresolvedAssetDescription: item.unresolvedAssetDescription,
                serviceMode: item.serviceMode,
                status: item.status,
                version: item.version,
                preparationNotes: item.preparationNotes,
                cancelledAt: item.cancelledAt?.toISOString() ?? null,
                cancellationReason: item.cancellationReason,
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString(),
            })),
            history: history.map((entry) => ({
                id: entry.id,
                version: entry.version,
                kind: entry.kind,
                snapshot: entry.snapshot,
                reason: entry.reason,
                recordedAt: entry.recordedAt.toISOString(),
                recordedByUserId: entry.recordedByUserId,
            })),
            itemHistory: itemHistory.map((entry) => ({
                id: entry.id,
                workItemId: entry.workItemId,
                version: entry.version,
                kind: entry.kind,
                snapshot: entry.snapshot,
                reason: entry.reason,
                recordedAt: entry.recordedAt.toISOString(),
                recordedByUserId: entry.recordedByUserId,
            })),
        });
    }

    list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: WorkOrderListQuery,
    ): Promise<WorkOrderListResponse> {
        let cursor: z.infer<typeof cursorSchema> | undefined;
        if (query.cursor) {
            try {
                cursor = cursorSchema.parse(
                    JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")),
                );
            } catch {
                throw new ContractException("INVALID_WORK_ORDER_CURSOR", 400);
            }
            if (
                cursor.status !== (query.status ?? null) ||
                cursor.requestId !== (query.requestId ?? null) ||
                cursor.siteId !== (query.siteId ?? null)
            )
                throw new ContractException("INVALID_WORK_ORDER_CURSOR", 400);
        }
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["work_orders.read"],
            async (tx) => {
                const instant = cursor ? sql`${cursor.createdAt}::timestamptz` : undefined;
                const rows = await tx
                    .select({
                        ...getTableColumns(workOrders),
                        createdAtExact: sql<string>`to_char(${workOrders.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
                    })
                    .from(workOrders)
                    .where(
                        and(
                            eq(workOrders.organizationId, organizationId),
                            query.status ? eq(workOrders.status, query.status) : undefined,
                            query.requestId ? eq(workOrders.requestId, query.requestId) : undefined,
                            query.siteId ? eq(workOrders.siteId, query.siteId) : undefined,
                            instant
                                ? or(
                                      lt(workOrders.createdAt, instant),
                                      and(
                                          eq(workOrders.createdAt, instant),
                                          lt(workOrders.id, cursor!.id),
                                      ),
                                  )
                                : undefined,
                        ),
                    )
                    .orderBy(desc(workOrders.createdAt), desc(workOrders.id))
                    .limit(query.limit + 1);
                const page = rows.slice(0, query.limit);
                const last = page.at(-1);
                return workOrderListResponseSchema.parse({
                    data: page.map(summary),
                    nextCursor:
                        rows.length > query.limit && last
                            ? Buffer.from(
                                  JSON.stringify({
                                      createdAt: last.createdAtExact,
                                      id: last.id,
                                      status: query.status ?? null,
                                      requestId: query.requestId ?? null,
                                      siteId: query.siteId ?? null,
                                  }),
                              ).toString("base64url")
                            : null,
                });
            },
        );
    }
}
