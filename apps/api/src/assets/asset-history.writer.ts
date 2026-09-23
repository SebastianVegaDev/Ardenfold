import { assetHistoryEntrySchema, type AssetHistoryEntry } from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import { assetHistoryEntries } from "@ardenfold/database/schema";
import { getCorrelationId } from "@ardenfold/observability";
import { z } from "zod";

const payloadSchema = z.record(
    z.string().min(1).max(80),
    z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]),
);
const sourceSchema = z.enum(["asset_registry", "work_order", "certificate"]);

export type AssetHistoryEventType = AssetHistoryEntry["event"];

export type RecordAssetHistory = Readonly<{
    organizationId: string;
    assetId: string;
    actorUserId: string;
    aggregateVersion: number;
    event: AssetHistoryEventType;
    payload?: Readonly<Record<string, string | number | boolean | null>>;
    source?: z.infer<typeof sourceSchema>;
    sourceReferenceId?: string;
}>;

/** Authorized application services append business history inside their domain transaction. */
export async function recordAssetHistory(
    transaction: ArdenfoldTransaction,
    input: RecordAssetHistory,
): Promise<void> {
    const traceId = getCorrelationId();
    if (!traceId) throw new Error("Asset history requires an active request correlation context.");
    const payload = payloadSchema.parse(input.payload ?? {});
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 8_192)
        throw new Error("Asset history payload exceeds the 8 KiB limit.");
    const source = sourceSchema.parse(input.source ?? "asset_registry");
    const parsed = assetHistoryEntrySchema
        .pick({
            event: true,
            aggregateVersion: true,
        })
        .parse(input);

    await transaction.insert(assetHistoryEntries).values({
        organizationId: input.organizationId,
        assetId: input.assetId,
        actorUserId: input.actorUserId,
        aggregateVersion: parsed.aggregateVersion,
        event: parsed.event,
        traceId,
        source,
        sourceReferenceId: input.sourceReferenceId ?? null,
        payload,
    });
}
