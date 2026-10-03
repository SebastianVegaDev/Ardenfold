import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001/api/v1";

async function token(identity: string): Promise<string> {
    const response = await fetch(`http://127.0.0.1:4010/test/access-token?identity=${identity}`);
    expect(response.ok).toBe(true);
    return ((await response.json()) as { access_token: string }).access_token;
}

async function call(
    accessToken: string,
    path: string,
    method = "GET",
    organizationId?: string,
    body?: unknown,
) {
    const response = await fetch(`${api}${path}`, {
        method,
        headers: {
            authorization: `Bearer ${accessToken}`,
            ...(organizationId ? { "x-ardenfold-organization-id": organizationId } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("work authorization preserves the accepted revision and prepares independently trackable items", async () => {
    const owner = await token("user_e2e_owner");
    const north = await call(owner, "/organizations", "POST", undefined, {
        name: "Work order North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    const south = await call(owner, "/organizations", "POST", undefined, {
        name: "Work order South",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(north.status).toBe(201);
    expect(south.status).toBe(201);
    const orgId = north.body.id as string;
    const southId = south.body.id as string;
    const site = await call(owner, "/organizations/current/sites", "POST", orgId, {
        name: "Main shop",
    });
    const alternateSite = await call(owner, "/organizations/current/sites", "POST", orgId, {
        name: "Alternate shop",
    });
    const otherSite = await call(owner, "/organizations/current/sites", "POST", southId, {
        name: "Other shop",
    });
    const customer = await call(owner, "/parties", "POST", orgId, {
        kind: "organization",
        displayName: "Industrial customer",
        roles: ["customer"],
    });
    const asset = await call(owner, "/assets", "POST", orgId, { displayName: "Pump A" });
    const otherAsset = await call(owner, "/assets", "POST", southId, { displayName: "Other pump" });
    const request = await call(owner, "/service-requests", "POST", orgId, {
        customerPartyId: customer.body.id,
        summary: "Inspect pumps",
        scopeItems: [{ description: "Inspect known and unknown pumps" }],
    });
    expect(request.status).toBe(201);
    const followUp = await call(
        owner,
        "/service-management/queues?kind=commercial_follow_up",
        "GET",
        orgId,
    );
    expect(followUp.status, JSON.stringify(followUp.body)).toBe(200);
    expect(
        (followUp.body.data as Array<{ requestId: string }>).some(
            (row) => row.requestId === request.body.id,
        ),
    ).toBe(true);
    const requestSearch = await call(
        owner,
        "/service-requests?q=Inspect%20pumps&sort=oldest",
        "GET",
        orgId,
    );
    expect(requestSearch.status, JSON.stringify(requestSearch.body)).toBe(200);
    expect(
        (requestSearch.body.data as Array<{ id: string }>).some(
            (row) => row.id === request.body.id,
        ),
    ).toBe(true);
    expect(
        (await call(owner, `/service-requests?q=${encodeURIComponent("%")}`, "GET", orgId)).status,
    ).toBe(400);
    const draft = {
        currencyCode: "PEN",
        paymentTerms: null,
        deliveryTerms: null,
        serviceLocation: null,
        intakeExpectations: null,
        exclusions: null,
        validUntil: null,
        lines: [
            {
                description: "Known pump inspection",
                quantity: "2",
                unit: "unit",
                unitPrice: "10",
                partyId: null,
                assetId: asset.body.id,
                adjustments: [],
            },
            {
                description: "Unidentified pump inspection",
                quantity: "1",
                unit: "unit",
                unitPrice: "10",
                partyId: null,
                assetId: null,
                adjustments: [],
            },
        ],
        adjustments: [],
    };
    const quote = await call(owner, "/quotations", "POST", orgId, {
        requestId: request.body.id,
        reference: `Q-${randomUUID()}`,
        draft,
    });
    expect(quote.status, JSON.stringify(quote.body)).toBe(201);
    const quoteId = quote.body.id as string;
    const revision = (
        quote.body.revisions as Array<{ id: string; lines: Array<{ id: string }> }>
    )[0]!;
    const offered = await call(
        owner,
        `/quotations/${quoteId}/revisions/${revision.id}/issue`,
        "POST",
        orgId,
        { expectedVersion: quote.body.version, channel: "email" },
    );
    expect(offered.status, JSON.stringify(offered.body)).toBe(200);
    const awaiting = await call(
        owner,
        "/service-management/queues?kind=awaiting_customer",
        "GET",
        orgId,
    );
    expect(awaiting.status, JSON.stringify(awaiting.body)).toBe(200);
    expect(
        (awaiting.body.data as Array<{ quoteId: string }>).some((row) => row.quoteId === quoteId),
    ).toBe(true);
    const quoteSearch = await call(
        owner,
        `/quotations?assetId=${asset.body.id as string}&q=Known%20pump`,
        "GET",
        orgId,
    );
    expect(quoteSearch.status, JSON.stringify(quoteSearch.body)).toBe(200);
    expect((quoteSearch.body.data as Array<{ id: string }>).some((row) => row.id === quoteId)).toBe(
        true,
    );
    const prematureAuthorization = await call(owner, "/work-orders", "POST", orgId, {
        quoteId,
        acceptanceId: randomUUID(),
        acceptedRevisionId: revision.id,
        expectedQuoteVersion: offered.body.version,
        expectedRequestVersion: request.body.version,
        siteId: site.body.id,
        reference: `WO-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        items: [
            {
                sourceRevisionLineId: revision.lines[0]!.id,
                scopeDescription: "Inspect known units",
                allocatedQuantity: "2",
                allocatedUnit: "unit",
                partyId: null,
                assetRequirement: "required",
                assetId: asset.body.id,
                unresolvedAssetDescription: null,
                serviceMode: "no_intake",
            },
            {
                sourceRevisionLineId: revision.lines[1]!.id,
                scopeDescription: "Inspect unknown unit",
                allocatedQuantity: "1",
                allocatedUnit: "unit",
                partyId: null,
                assetRequirement: "required",
                assetId: null,
                unresolvedAssetDescription: "Unlabelled pump",
                serviceMode: "no_intake",
            },
        ],
    });
    expect(prematureAuthorization.status).toBe(409);
    const acceptance = await call(owner, `/quotations/${quoteId}/acceptances`, "POST", orgId, {
        expectedVersion: offered.body.version,
        idempotencyKey: randomUUID(),
        revisionId: revision.id,
        agreementAt: null,
        suppliedByName: "Customer contact",
        suppliedByContactId: null,
        channel: "email",
        externalReference: null,
    });
    expect(acceptance.status, JSON.stringify(acceptance.body)).toBe(200);
    const authorized = await call(
        owner,
        "/service-management/queues?kind=accepted_unoperationalized",
        "GET",
        orgId,
    );
    expect(authorized.status, JSON.stringify(authorized.body)).toBe(200);
    expect(
        (authorized.body.data as Array<{ acceptanceId: string }>).some(
            (row) => row.acceptanceId === acceptance.body.id,
        ),
    ).toBe(true);
    const acceptedQuote = await call(owner, `/quotations/${quoteId}`, "GET", orgId);
    const item = (
        lineId: string,
        quantity: string,
        assetId: string | null,
        unresolvedAssetDescription: string | null,
    ) => ({
        sourceRevisionLineId: lineId,
        scopeDescription: "Inspect physical unit",
        allocatedQuantity: quantity,
        allocatedUnit: "unit",
        partyId: null,
        assetRequirement: "required",
        assetId,
        unresolvedAssetDescription,
        serviceMode: "no_intake",
    });
    const orderInput = {
        quoteId,
        acceptanceId: acceptance.body.id,
        acceptedRevisionId: revision.id,
        expectedQuoteVersion: acceptedQuote.body.version,
        expectedRequestVersion: request.body.version,
        siteId: site.body.id,
        reference: `WO-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        items: [
            item(revision.lines[0]!.id, "1", asset.body.id as string, null),
            item(revision.lines[0]!.id, "1", asset.body.id as string, null),
            item(revision.lines[1]!.id, "1", null, "Unlabelled pump"),
        ],
    };
    const invalidPartition = await call(owner, "/work-orders", "POST", orgId, {
        ...orderInput,
        items: orderInput.items.slice(0, 2),
        idempotencyKey: randomUUID(),
    });
    expect(invalidPartition.status).toBe(400);
    const foreignSite = await call(owner, "/work-orders", "POST", orgId, {
        ...orderInput,
        siteId: otherSite.body.id,
        idempotencyKey: randomUUID(),
    });
    expect(foreignSite.status).toBe(404);
    const foreignAsset = await call(owner, "/work-orders", "POST", orgId, {
        ...orderInput,
        idempotencyKey: randomUUID(),
        items: [
            orderInput.items[0],
            { ...orderInput.items[1], assetId: otherAsset.body.id },
            orderInput.items[2],
        ],
    });
    expect(foreignAsset.status).toBeGreaterThanOrEqual(400);
    const created = await call(owner, "/work-orders", "POST", orgId, orderInput);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderId = created.body.id as string;
    const activeWork = await call(
        owner,
        "/service-management/queues?kind=active_work",
        "GET",
        orgId,
    );
    expect(activeWork.status, JSON.stringify(activeWork.body)).toBe(200);
    expect(
        (activeWork.body.data as Array<{ workOrderId: string }>).some(
            (row) => row.workOrderId === orderId,
        ),
    ).toBe(true);
    const notReady = await call(
        owner,
        "/service-management/queues?kind=items_not_ready",
        "GET",
        orgId,
    );
    expect(notReady.status, JSON.stringify(notReady.body)).toBe(200);
    expect(
        (notReady.body.data as Array<{ workOrderId: string }>).filter(
            (row) => row.workOrderId === orderId,
        ),
    ).toHaveLength(3);
    const firstQueuePage = await call(
        owner,
        "/service-management/queues?kind=items_not_ready&limit=2",
        "GET",
        orgId,
    );
    expect(firstQueuePage.status, JSON.stringify(firstQueuePage.body)).toBe(200);
    expect(firstQueuePage.body.nextCursor).toBeTruthy();
    const secondQueuePage = await call(
        owner,
        `/service-management/queues?kind=items_not_ready&limit=2&cursor=${encodeURIComponent(firstQueuePage.body.nextCursor as string)}`,
        "GET",
        orgId,
    );
    expect(secondQueuePage.status, JSON.stringify(secondQueuePage.body)).toBe(200);
    const queueIds = [
        ...(firstQueuePage.body.data as Array<{ subjectId: string }>),
        ...(secondQueuePage.body.data as Array<{ subjectId: string }>),
    ].map((row) => row.subjectId);
    expect(new Set(queueIds).size).toBe(queueIds.length);
    expect(queueIds).toHaveLength(3);
    expect(
        (
            await call(
                owner,
                `/service-management/queues?kind=active_work&cursor=${encodeURIComponent(firstQueuePage.body.nextCursor as string)}`,
                "GET",
                orgId,
            )
        ).status,
    ).toBe(400);
    const orderSearch = await call(
        owner,
        `/work-orders?assetId=${asset.body.id as string}&q=physical%20unit`,
        "GET",
        orgId,
    );
    expect(orderSearch.status, JSON.stringify(orderSearch.body)).toBe(200);
    expect((orderSearch.body.data as Array<{ id: string }>).some((row) => row.id === orderId)).toBe(
        true,
    );
    const timeline = await call(
        owner,
        `/service-management/requests/${request.body.id as string}/timeline?limit=2`,
        "GET",
        orgId,
    );
    expect(timeline.status, JSON.stringify(timeline.body)).toBe(200);
    expect(timeline.body.nextCursor).toBeTruthy();
    expect((timeline.body.currentCustomer as { name: string }).name).toBe("Industrial customer");
    const olderTimeline = await call(
        owner,
        `/service-management/requests/${request.body.id as string}/timeline?limit=2&cursor=${encodeURIComponent(timeline.body.nextCursor as string)}`,
        "GET",
        orgId,
    );
    expect(olderTimeline.status, JSON.stringify(olderTimeline.body)).toBe(200);
    expect(
        (olderTimeline.body.data as Array<{ key: string }>).every(
            (event) =>
                !(timeline.body.data as Array<{ key: string }>).some(
                    (newer) => newer.key === event.key,
                ),
        ),
    ).toBe(true);
    expect(
        (
            await call(
                owner,
                `/service-management/requests/${request.body.id as string}/timeline`,
                "GET",
                southId,
            )
        ).status,
    ).toBe(404);
    expect(
        (
            await call(
                owner,
                `/service-management/queues?kind=active_work&customerPartyId=${customer.body.id as string}`,
                "GET",
                southId,
            )
        ).body.data,
    ).toEqual([]);
    expect(created.body.acceptedRevisionId).toBe(revision.id);
    expect(
        (created.body.items as Array<{ assetId: string | null }>).map((row) => row.assetId),
    ).toEqual([asset.body.id, asset.body.id, null]);
    expect(created.body.history as unknown[]).toHaveLength(1);
    expect(created.body.itemHistory as unknown[]).toHaveLength(3);
    const replay = await call(owner, "/work-orders", "POST", orgId, orderInput);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(orderId);
    const conflictingReplay = await call(owner, "/work-orders", "POST", orgId, {
        ...orderInput,
        reference: `WO-${randomUUID()}`,
    });
    expect(conflictingReplay.status).toBe(409);
    const duplicateAuthorization = await call(owner, "/work-orders", "POST", orgId, {
        ...orderInput,
        idempotencyKey: randomUUID(),
        reference: `WO-${randomUUID()}`,
    });
    expect(duplicateAuthorization.status).toBe(409);
    expect((await call(owner, `/work-orders/${orderId}`, "GET", southId)).status).toBe(404);
    expect((await call(owner, "/work-orders", "GET", southId)).body.data).toEqual([]);
    expect(
        (
            await call(owner, `/quotations/${quoteId}/acceptances/withdraw`, "POST", orgId, {
                expectedVersion: acceptedQuote.body.version,
                reason: "Attempt after authorization",
            })
        ).status,
    ).toBe(409);
    expect((await call(owner, `/quotations/${quoteId}`, "GET", orgId)).body.revisions).toEqual(
        acceptedQuote.body.revisions,
    );

    let current = created.body;
    const itemRows = current.items as Array<{ id: string; version: number }>;
    const readiness = await call(owner, `/work-orders/${orderId}/readiness`, "GET", orgId);
    expect(readiness.status).toBe(200);
    expect(readiness.body.data).toEqual([
        { itemId: itemRows[0]!.id, blocker: null },
        { itemId: itemRows[1]!.id, blocker: null },
        { itemId: itemRows[2]!.id, blocker: "WORK_ITEM_ASSET_UNRESOLVED" },
    ]);
    expect((await call(owner, `/work-orders/${orderId}/readiness`, "GET", southId)).status).toBe(
        404,
    );
    const unresolvedReady = await call(
        owner,
        `/work-orders/${orderId}/items/${itemRows[2]!.id}/ready`,
        "POST",
        orgId,
        {
            expectedOrderVersion: current.version,
            expectedItemVersion: itemRows[2]!.version,
            reason: "Try unresolved work",
        },
    );
    expect(unresolvedReady.status).toBe(409);
    const stale = await call(owner, `/work-orders/${orderId}`, "PATCH", orgId, {
        expectedVersion: 999,
        reason: "Stale",
        preparationNotes: "No change",
    });
    expect(stale.status).toBe(409);
    const changedSite = await call(owner, `/work-orders/${orderId}`, "PATCH", orgId, {
        expectedVersion: current.version,
        reason: "Move preparation to alternate site",
        siteId: alternateSite.body.id,
    });
    expect(changedSite.status, JSON.stringify(changedSite.body)).toBe(200);
    current = changedSite.body;
    const invalidRestructure = await call(
        owner,
        `/work-orders/${orderId}/items/${itemRows[0]!.id}/restructure`,
        "POST",
        orgId,
        {
            expectedOrderVersion: current.version,
            expectedItemVersion: itemRows[0]!.version,
            reason: "Invalid extra scope",
            replacements: [item(revision.lines[0]!.id, "2", asset.body.id as string, null)],
        },
    );
    expect(invalidRestructure.status).toBe(400);
    const split = await call(
        owner,
        `/work-orders/${orderId}/items/${itemRows[0]!.id}/restructure`,
        "POST",
        orgId,
        {
            expectedOrderVersion: current.version,
            expectedItemVersion: itemRows[0]!.version,
            reason: "Split physical unit work",
            replacements: [
                {
                    ...item(revision.lines[0]!.id, "0.5", asset.body.id as string, null),
                    serviceMode: "physical_intake",
                },
                item(revision.lines[0]!.id, "0.5", asset.body.id as string, null),
            ],
        },
    );
    expect(split.status, JSON.stringify(split.body)).toBe(200);
    current = split.body;
    const splitItems = current.items as Array<{
        id: string;
        version: number;
        status: string;
        serviceMode: string;
    }>;
    expect(splitItems).toHaveLength(5);
    expect(splitItems[0]!.status).toBe("cancelled");
    const intakeItem = splitItems.find((row) => row.serviceMode === "physical_intake")!;
    const missingReceipt = await call(
        owner,
        `/work-orders/${orderId}/items/${intakeItem.id}/ready`,
        "POST",
        orgId,
        {
            expectedOrderVersion: current.version,
            expectedItemVersion: intakeItem.version,
            reason: "Try before intake",
        },
    );
    expect(missingReceipt.status).toBe(409);
    const noIntake = await call(
        owner,
        `/work-orders/${orderId}/items/${intakeItem.id}`,
        "PATCH",
        orgId,
        {
            expectedOrderVersion: current.version,
            expectedItemVersion: intakeItem.version,
            reason: "Perform at customer site",
            serviceMode: "no_intake",
        },
    );
    expect(noIntake.status, JSON.stringify(noIntake.body)).toBe(200);
    current = noIntake.body;
    const excludedItem = (current.items as Array<{ id: string; version: number }>).find(
        (row) => !itemRows.some((original) => original.id === row.id) && row.id !== intakeItem.id,
    )!;
    const excluded = await call(
        owner,
        `/work-orders/${orderId}/items/${excludedItem.id}/cancel`,
        "POST",
        orgId,
        {
            expectedOrderVersion: current.version,
            expectedItemVersion: excludedItem.version,
            reason: "Exclude duplicate operational unit",
        },
    );
    expect(excluded.status, JSON.stringify(excluded.body)).toBe(200);
    expect(excluded.body.status).toBe("planned");
    current = excluded.body;
    const resolved = await call(
        owner,
        `/work-orders/${orderId}/items/${itemRows[2]!.id}`,
        "PATCH",
        orgId,
        {
            expectedOrderVersion: current.version,
            expectedItemVersion: itemRows[2]!.version,
            reason: "Asset identified",
            assetId: asset.body.id,
        },
    );
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);
    current = resolved.body;
    for (const workItem of current.items as Array<{
        id: string;
        version: number;
        status: string;
    }>) {
        if (workItem.status === "cancelled") continue;
        const ready = await call(
            owner,
            `/work-orders/${orderId}/items/${workItem.id}/ready`,
            "POST",
            orgId,
            {
                expectedOrderVersion: current.version,
                expectedItemVersion: workItem.version,
                reason: "Preparation complete",
            },
        );
        expect(ready.status, JSON.stringify(ready.body)).toBe(200);
        current = ready.body;
    }
    const readyOrder = await call(owner, `/work-orders/${orderId}/ready`, "POST", orgId, {
        expectedVersion: current.version,
        reason: "All items ready",
    });
    expect(readyOrder.status, JSON.stringify(readyOrder.body)).toBe(200);
    expect(readyOrder.body.status).toBe("ready");
    const technicalItem = (
        readyOrder.body.items as Array<{ id: string; version: number; status: string }>
    ).find((item) => item.status === "ready")!;
    const technicalStart = {
        workOrderId: orderId,
        workItemId: technicalItem.id,
        expectedOrderVersion: readyOrder.body.version,
        expectedItemVersion: technicalItem.version,
        idempotencyKey: randomUUID(),
    };
    const started = await call(owner, "/technical-executions", "POST", orgId, technicalStart);
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const startedExecution = started.body.execution as { id: string; version: number };
    const initialTechnicalRevision = started.body.initialRevision as {
        id: string;
        version: number;
    };
    const technicalReplay = await call(owner, "/technical-executions", "POST", orgId, technicalStart);
    expect(technicalReplay.status, JSON.stringify(technicalReplay.body)).toBe(201);
    expect((technicalReplay.body.execution as { id: string }).id).toBe(startedExecution.id);
    const technicalDetail = await call(
        owner,
        `/technical-executions/${startedExecution.id}`,
        "GET",
        orgId,
    );
    expect(technicalDetail.status, JSON.stringify(technicalDetail.body)).toBe(200);
    expect((technicalDetail.body.revisions as Array<unknown>).length).toBe(1);
    const editedTechnicalDraft = await call(
        owner,
        `/technical-executions/${startedExecution.id}/revisions/${initialTechnicalRevision.id}`,
        "PATCH",
        orgId,
        { expectedVersion: initialTechnicalRevision.version, methodName: "Visual inspection" },
    );
    expect(editedTechnicalDraft.status, JSON.stringify(editedTechnicalDraft.body)).toBe(200);
    const blockedOrderChange = await call(owner, `/work-orders/${orderId}/planned`, "POST", orgId, {
        expectedVersion: readyOrder.body.version,
        reason: "Cannot change consumed work",
    });
    expect(blockedOrderChange.status).toBe(409);
    const executionAfterEdit = await call(
        owner,
        `/technical-executions/${startedExecution.id}`,
        "GET",
        orgId,
    );
    const abandonedExecution = await call(
        owner,
        `/technical-executions/${startedExecution.id}/abandon`,
        "POST",
        orgId,
        {
            expectedVersion: (executionAfterEdit.body.execution as { version: number }).version,
            reason: "Inspection attempt stopped",
        },
    );
    expect(abandonedExecution.status, JSON.stringify(abandonedExecution.body)).toBe(200);
    const orderBackToPlanned = await call(owner, `/work-orders/${orderId}/planned`, "POST", orgId, {
        expectedVersion: readyOrder.body.version,
        reason: "Recheck preparation",
    });
    expect(orderBackToPlanned.status, JSON.stringify(orderBackToPlanned.body)).toBe(200);
    const cancelled = await call(owner, `/work-orders/${orderId}/cancel`, "POST", orgId, {
        expectedVersion: orderBackToPlanned.body.version,
        reason: "Customer stopped work",
    });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect(
        (cancelled.body.items as Array<{ status: string }>).every(
            (row) => row.status === "cancelled",
        ),
    ).toBe(true);
    const reopened = await call(owner, `/work-orders/${orderId}/ready`, "POST", orgId, {
        expectedVersion: cancelled.body.version,
        reason: "Invalid reopen",
    });
    expect(reopened.status).toBe(409);
    const invitation = await call(owner, "/organizations/current/invitations", "POST", orgId, {
        email: "member@example.test",
        role: "viewer",
    });
    expect(invitation.status).toBe(201);
    const viewer = await token("user_e2e_member");
    expect(
        (
            await call(viewer, "/invitations/accept", "POST", undefined, {
                token: invitation.body.acceptanceToken,
            })
        ).status,
    ).toBe(201);
    expect((await call(viewer, `/work-orders/${orderId}`, "GET", orgId)).status).toBe(200);
    expect(
        (await call(viewer, "/service-management/queues?kind=active_work", "GET", orgId)).status,
    ).toBe(200);
    expect(
        (
            await call(
                viewer,
                `/service-management/requests/${request.body.id as string}/timeline`,
                "GET",
                orgId,
            )
        ).status,
    ).toBe(200);
    expect((await call(viewer, "/work-orders", "POST", orgId, orderInput)).status).toBe(403);
    const members = await call(owner, "/organizations/current/members", "GET", orgId);
    const membershipId = (members.body.data as Array<{ email: string; membershipId: string }>).find(
        (member) => member.email === "member@example.test",
    )?.membershipId;
    expect(membershipId).toBeDefined();
    const suspension = await fetch(`${api}/organizations/current/members/${membershipId}/suspend`, {
        method: "POST",
        headers: { authorization: `Bearer ${owner}`, "x-ardenfold-organization-id": orgId },
    });
    expect(suspension.status).toBe(204);
    expect((await call(viewer, `/work-orders/${orderId}`, "GET", orgId)).status).toBe(403);
    expect(
        (await call(viewer, "/service-management/queues?kind=active_work", "GET", orgId)).status,
    ).toBe(403);
    const audit = await call(owner, "/audit-events", "GET", orgId);
    expect(audit.status).toBe(200);
    expect(JSON.stringify(audit.body)).toContain("work_order.authorized");
});
