import type { ArdenfoldTransaction } from "@ardenfold/database";
import { technicalExecutions } from "@ardenfold/database/schema";
import { and, eq, sql } from "drizzle-orm";

import { ContractException } from "../../../http/contracts";

/** Service Management calls this while holding its order or item lock. */
export async function requireTechnicalWorkUnconsumed(
    tx: ArdenfoldTransaction,
    organizationId: string,
    workOrderId: string,
    workItemId?: string,
): Promise<void> {
    const access = await tx.execute(
        sql`SELECT current_setting('ardenfold.permission.technical_executions.read', true) AS allowed`,
    );
    if (access.rows[0]?.allowed !== "true")
        throw new ContractException("TECHNICAL_HANDOFF_PERMISSION_REQUIRED", 403);
    const [started] = await tx
        .select({ id: technicalExecutions.id })
        .from(technicalExecutions)
        .where(
            and(
                eq(technicalExecutions.organizationId, organizationId),
                eq(technicalExecutions.workOrderId, workOrderId),
                eq(technicalExecutions.status, "active"),
                workItemId ? eq(technicalExecutions.workItemId, workItemId) : undefined,
            ),
        )
        .limit(1);
    if (started) throw new ContractException("WORK_ITEM_TECHNICAL_WORK_STARTED", 409);
}
