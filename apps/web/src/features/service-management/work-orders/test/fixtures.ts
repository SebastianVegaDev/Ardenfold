import type {
    AssetCurrentRelationships,
    OrganizationSite,
    QuoteDetail,
    ReceiptDetail,
    WorkOrderDetail,
} from "@ardenfold/contracts";

import {
    quote as baseQuote,
    request,
    revisionId,
    time,
} from "@/features/service-management/quotations/test/fixtures";

export const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
export const assetId = id("201");
export const orderId = id("202");
export const itemId = id("203");
export const receiptId = id("204");
export const acceptanceId = id("205");
export const site: OrganizationSite = {
    id: id("206"),
    organizationId: id("207"),
    name: "Main shop",
    code: null,
    timeZone: null,
    isActive: true,
};

export const acceptedQuote: QuoteDetail = {
    ...baseQuote,
    status: "accepted",
    activeAcceptanceId: acceptanceId,
    revisions: [
        {
            ...baseQuote.revisions[0]!,
            status: "accepted",
            lines: [{ ...baseQuote.revisions[0]!.lines[0]!, quantity: "2", unit: "unit", assetId }],
        },
    ],
    acceptances: [
        {
            id: acceptanceId,
            quoteId: baseQuote.id,
            revisionId,
            agreementAt: null,
            recordedAt: time,
            recordedByUserId: id("208"),
            suppliedByName: "Customer",
            suppliedByContactId: null,
            channel: "email",
            externalReference: null,
            withdrawnAt: null,
            withdrawalReason: null,
        },
    ],
};

export const workOrder: WorkOrderDetail = {
    id: orderId,
    requestId: request.id,
    quoteId: acceptedQuote.id,
    acceptanceId,
    acceptedRevisionId: revisionId,
    customerPartyId: request.customerPartyId,
    siteId: site.id,
    reference: "WO-1",
    status: "planned",
    version: 1,
    createdAt: time,
    updatedAt: time,
    initialAllocationSnapshot: { acceptedRevisionId: revisionId },
    preparationNotes: null,
    cancelledAt: null,
    cancellationReason: null,
    items: [
        {
            id: itemId,
            workOrderId: orderId,
            itemNumber: 1,
            replacesItemId: null,
            sourceRevisionLineId: acceptedQuote.revisions[0]!.lines[0]!.id,
            scopeDescription: "Inspect pump",
            allocatedQuantity: "2",
            allocatedUnit: "unit",
            partyId: null,
            assetRequirement: "required",
            assetId,
            unresolvedAssetDescription: null,
            serviceMode: "physical_intake",
            status: "planned",
            version: 1,
            preparationNotes: null,
            cancelledAt: null,
            cancellationReason: null,
            createdAt: time,
            updatedAt: time,
        },
    ],
    history: [],
    itemHistory: [],
};

export const relationships: AssetCurrentRelationships = {
    assetId,
    assetVersion: 1,
    ownership: null,
    custody: null,
    location: null,
};

export const receipt: ReceiptDetail = {
    id: receiptId,
    workOrderId: orderId,
    assetId,
    intakeDescription: "Received at desk",
    observedCondition: "Case scratched",
    accessories: ["Cable"],
    receivedAt: time,
    responsibleActorName: "Technician",
    responsiblePartyId: null,
    coordination: { custodyRelationshipId: null, locationRelationshipId: null },
    custodyStatus: "not_required",
    version: 1,
    recordedAt: time,
    updatedAt: time,
    voidedAt: null,
    itemIds: [itemId],
    corrections: [],
};
