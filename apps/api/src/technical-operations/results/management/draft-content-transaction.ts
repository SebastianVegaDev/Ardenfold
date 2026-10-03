import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    executionHistoryEntries,
    executionRevisions,
    technicalExecutions,
} from "@ardenfold/database/schema";
import { and, eq } from "drizzle-orm";

import { ContractException } from "../../../http/contracts";

export async function mutateDraftContent<Result>(
    tx: ArdenfoldTransaction,
    organizationId: string,
    executionId: string,
    revisionId: string,
    expectedRevisionVersion: number,
    actorId: string,
    kind: string,
    operation: (revision: typeof executionRevisions.$inferSelect) => Promise<Result>,
): Promise<Result> {
    const [execution] = await tx
        .select()
        .from(technicalExecutions)
        .where(
            and(
                eq(technicalExecutions.organizationId, organizationId),
                eq(technicalExecutions.id, executionId),
            ),
        )
        .for("update");
    if (!execution) throw new ContractException("TECHNICAL_EXECUTION_NOT_FOUND", 404);
    const [revision] = await tx
        .select()
        .from(executionRevisions)
        .where(
            and(
                eq(executionRevisions.organizationId, organizationId),
                eq(executionRevisions.executionId, executionId),
                eq(executionRevisions.id, revisionId),
            ),
        )
        .for("update");
    if (!revision) throw new ContractException("TECHNICAL_REVISION_NOT_FOUND", 404);
    if (execution.status !== "active" || revision.status !== "draft")
        throw new ContractException("TECHNICAL_REVISION_NOT_EDITABLE", 409);
    if (revision.version !== expectedRevisionVersion)
        throw new ContractException("VERSION_CONFLICT", 409);

    const result = await operation(revision);
    const [updated] = await tx
        .update(executionRevisions)
        .set({
            version: revision.version + 1,
            updatedByUserId: actorId,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(executionRevisions.id, revisionId),
                eq(executionRevisions.version, revision.version),
            ),
        )
        .returning();
    if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
    const [advanced] = await tx
        .update(technicalExecutions)
        .set({ version: execution.version + 1 })
        .where(
            and(
                eq(technicalExecutions.id, executionId),
                eq(technicalExecutions.version, execution.version),
            ),
        )
        .returning();
    if (!advanced) throw new ContractException("VERSION_CONFLICT", 409);
    await tx.insert(executionHistoryEntries).values({
        organizationId,
        executionId,
        executionVersion: advanced.version,
        revisionId,
        kind,
        snapshot: { revisionVersion: updated.version },
        recordedByUserId: actorId,
    });
    return result;
}
