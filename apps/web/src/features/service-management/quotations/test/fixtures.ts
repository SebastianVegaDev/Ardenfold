import type { QuoteDetail, ServiceRequestDetail } from "@ardenfold/contracts";

export const quoteId = "00000000-0000-4000-8000-000000000094";
export const revisionId = "00000000-0000-4000-8000-000000000095";
export const requestId = "00000000-0000-4000-8000-000000000096";
export const time = "2026-01-02T00:00:00.000Z";

export const request: ServiceRequestDetail = {
    id: requestId,
    customerPartyId: "00000000-0000-4000-8000-000000000097",
    requesterContactId: null,
    requesterName: null,
    siteId: null,
    summary: "Inspect motor",
    customerContext: null,
    status: "active",
    version: 1,
    createdAt: time,
    updatedAt: time,
    terminalAt: null,
    terminalReason: null,
    scopeItems: [
        {
            id: "00000000-0000-4000-8000-000000000098",
            position: 1,
            description: "Inspect motor bearings",
            assetId: null,
            unidentifiedAssetDescription: "Motor without tag",
        },
    ],
};

export const quote: QuoteDetail = {
    id: quoteId,
    requestId,
    customerPartyId: request.customerPartyId,
    reference: "Q-2026-001",
    status: "open",
    version: 2,
    activeAcceptanceId: null,
    createdAt: time,
    updatedAt: time,
    revisions: [
        {
            id: revisionId,
            quoteId,
            revisionNumber: 1,
            sourceRevisionId: null,
            status: "draft",
            version: 1,
            sourceRequestVersion: 1,
            currencyCode: "PEN",
            currencyScale: 2,
            calculationPolicyVersion: 1,
            paymentTerms: null,
            deliveryTerms: null,
            serviceLocation: null,
            intakeExpectations: null,
            exclusions: null,
            validUntil: null,
            lines: [
                {
                    id: "00000000-0000-4000-8000-000000000099",
                    position: 1,
                    description: "Inspect motor bearings",
                    quantity: "1",
                    unit: "service",
                    unitPrice: "125.00",
                    partyId: null,
                    assetId: null,
                    adjustments: [],
                    roundedBaseAmount: null,
                    totalAmount: null,
                    partySnapshot: null,
                    assetSnapshot: null,
                },
            ],
            adjustments: [],
            subtotal: null,
            total: null,
            customerSnapshot: null,
            issuedAt: null,
            issueChannel: null,
            supersededByRevisionId: null,
            createdAt: time,
        },
    ],
    acceptances: [],
    history: [],
};
