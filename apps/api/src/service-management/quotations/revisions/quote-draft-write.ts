import type { CreateQuote } from "@ardenfold/contracts";
import { supportedQuoteCurrencies } from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    quoteLineAdjustments,
    quoteRevisionAdjustments,
    quoteRevisionLines,
} from "@ardenfold/database/schema";
import { and, eq } from "drizzle-orm";

import { calculateQuoteDraft } from "./quote-money";

type Draft = CreateQuote["draft"];

export async function writeDraftChildren(
    tx: ArdenfoldTransaction,
    organizationId: string,
    revisionId: string,
    draft: Draft,
): Promise<void> {
    calculateQuoteDraft(draft);
    const scale = supportedQuoteCurrencies[draft.currencyCode];
    await clearDraftChildren(tx, organizationId, revisionId);
    for (const [index, line] of draft.lines.entries()) {
        const [written] = await tx
            .insert(quoteRevisionLines)
            .values({
                organizationId,
                revisionId,
                currencyScale: scale,
                position: index + 1,
                description: line.description,
                quantity: line.quantity,
                unit: line.unit,
                unitPrice: line.unitPrice,
                partyId: line.partyId ?? null,
                assetId: line.assetId ?? null,
            })
            .returning({ id: quoteRevisionLines.id });
        if (line.adjustments.length)
            await tx.insert(quoteLineAdjustments).values(
                line.adjustments.map((adjustment, adjustmentIndex) => ({
                    organizationId,
                    revisionId,
                    lineId: written!.id,
                    currencyScale: scale,
                    position: adjustmentIndex + 1,
                    label: adjustment.label,
                    amount: adjustment.amount,
                })),
            );
    }
    if (draft.adjustments.length)
        await tx.insert(quoteRevisionAdjustments).values(
            draft.adjustments.map((adjustment, index) => ({
                organizationId,
                revisionId,
                currencyScale: scale,
                position: index + 1,
                label: adjustment.label,
                amount: adjustment.amount,
            })),
        );
}

export async function clearDraftChildren(
    tx: ArdenfoldTransaction,
    organizationId: string,
    revisionId: string,
): Promise<void> {
    await tx
        .delete(quoteLineAdjustments)
        .where(
            and(
                eq(quoteLineAdjustments.organizationId, organizationId),
                eq(quoteLineAdjustments.revisionId, revisionId),
            ),
        );
    await tx
        .delete(quoteRevisionAdjustments)
        .where(
            and(
                eq(quoteRevisionAdjustments.organizationId, organizationId),
                eq(quoteRevisionAdjustments.revisionId, revisionId),
            ),
        );
    await tx
        .delete(quoteRevisionLines)
        .where(
            and(
                eq(quoteRevisionLines.organizationId, organizationId),
                eq(quoteRevisionLines.revisionId, revisionId),
            ),
        );
}
