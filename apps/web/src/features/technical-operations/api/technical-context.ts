import "server-only";

import { z } from "zod";

import { getServerEnvironment } from "@/config/environment";
import { getAsset } from "@/features/assets/api-client";
import { getParty } from "@/features/parties/api-client";
import { getWorkOrder } from "@/features/service-management/work-orders/api/work-order-api";

const basisSchema = z.object({
    execution: z.object({ workOrderId: z.uuid(), targetAssetIdAtStart: z.uuid().nullable() }),
});

export async function getTechnicalContext(
    token: string,
    organizationId: string,
    executionId: string,
) {
    const response = await fetch(
        new URL(
            `/api/v1/technical-executions/${executionId}`,
            getServerEnvironment().ARDENFOLD_API_URL,
        ),
        {
            headers: {
                authorization: `Bearer ${token}`,
                "x-ardenfold-organization-id": organizationId,
            },
            cache: "no-store",
        },
    );
    if (!response.ok) return null;
    const basis = basisSchema.safeParse(await response.json());
    if (!basis.success) return null;
    const order = await getWorkOrder(token, organizationId, basis.data.execution.workOrderId);
    const [party, asset] = await Promise.all([
        getParty(token, organizationId, order.customerPartyId),
        basis.data.execution.targetAssetIdAtStart
            ? getAsset(token, organizationId, basis.data.execution.targetAssetIdAtStart)
            : Promise.resolve(null),
    ]);
    return {
        customerName: party.displayName,
        customerPartyId: party.id,
        workOrderReference: order.reference,
        assetName: asset?.displayName ?? null,
    };
}
