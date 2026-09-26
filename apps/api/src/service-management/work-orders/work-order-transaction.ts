import type { ArdenfoldTransaction } from "@ardenfold/database";
import { workOrders, type WorkOrder } from "@ardenfold/database/schema";
import { and, eq, sql } from "drizzle-orm";

import { ContractException } from "../../http/contracts";

export async function lockWorkOrder(
    tx: ArdenfoldTransaction,
    organizationId: string,
    workOrderId: string,
    expectedVersion?: number,
): Promise<WorkOrder> {
    const [order] = await tx
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.organizationId, organizationId), eq(workOrders.id, workOrderId)))
        .for("update");
    if (!order) throw new ContractException("WORK_ORDER_NOT_FOUND", 404);
    if (expectedVersion !== undefined && order.version !== expectedVersion)
        throw new ContractException("VERSION_CONFLICT", 409);
    return order;
}

export async function setWorkChangeReason(tx: ArdenfoldTransaction, reason: string): Promise<void> {
    await tx.execute(sql`SELECT set_config('ardenfold.change_reason', ${reason}, true)`);
}

export async function advanceWorkOrder(
    tx: ArdenfoldTransaction,
    order: WorkOrder,
    userId: string,
    changes: Partial<
        Pick<
            WorkOrder,
            | "status"
            | "siteId"
            | "preparationNotes"
            | "nextItemNumber"
            | "cancelledAt"
            | "cancelledByUserId"
            | "cancellationReason"
        >
    >,
): Promise<WorkOrder> {
    const [updated] = await tx
        .update(workOrders)
        .set({
            ...changes,
            version: order.version + 1,
            updatedByUserId: userId,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(workOrders.organizationId, order.organizationId),
                eq(workOrders.id, order.id),
                eq(workOrders.version, order.version),
            ),
        )
        .returning();
    if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
    return updated;
}
