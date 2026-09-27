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
    org?: string,
    body?: unknown,
) {
    const response = await fetch(`${api}${path}`, {
        method,
        headers: {
            authorization: `Bearer ${accessToken}`,
            ...(org ? { "x-ardenfold-organization-id": org } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("receipt coordinates custody atomically and retains corrections and unknown intake", async () => {
    const owner = await token("user_e2e_owner");
    const north = await call(owner, "/organizations", "POST", undefined, {
        name: "Receipt North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    const south = await call(owner, "/organizations", "POST", undefined, {
        name: "Receipt South",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(north.status).toBe(201);
    expect(south.status).toBe(201);
    const orgId = north.body.id as string;
    const southId = south.body.id as string;
    const site = await call(owner, "/organizations/current/sites", "POST", orgId, {
        name: "Intake shop",
    });
    const foreignSite = await call(owner, "/organizations/current/sites", "POST", southId, {
        name: "Other shop",
    });
    const customer = await call(owner, "/parties", "POST", orgId, {
        kind: "organization",
        displayName: "Intake customer",
        roles: ["customer"],
    });
    const asset = await call(owner, "/assets", "POST", orgId, { displayName: "Known unit" });
    const secondAsset = await call(owner, "/assets", "POST", orgId, {
        displayName: "Later identified unit",
    });
    const foreignAsset = await call(owner, "/assets", "POST", southId, {
        displayName: "Foreign unit",
    });
    const ownership = await call(
        owner,
        `/assets/${asset.body.id as string}/relationships/start`,
        "POST",
        orgId,
        {
            expectedVersion: asset.body.version,
            kind: "ownership",
            subject: "party",
            partyId: customer.body.id,
            effectiveAt: new Date(Date.now() - 60_000).toISOString(),
        },
    );
    expect(ownership.status, JSON.stringify(ownership.body)).toBe(201);
    const request = await call(owner, "/service-requests", "POST", orgId, {
        customerPartyId: customer.body.id,
        summary: "Inspect units",
        scopeItems: [{ description: "Inspect two units" }],
    });
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
                description: "Inspect units",
                quantity: "2",
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
    const revision = (
        quote.body.revisions as Array<{ id: string; lines: Array<{ id: string }> }>
    )[0]!;
    const offered = await call(
        owner,
        `/quotations/${quote.body.id as string}/revisions/${revision.id}/issue`,
        "POST",
        orgId,
        { expectedVersion: quote.body.version, channel: "email" },
    );
    const acceptance = await call(
        owner,
        `/quotations/${quote.body.id as string}/acceptances`,
        "POST",
        orgId,
        {
            expectedVersion: offered.body.version,
            idempotencyKey: randomUUID(),
            revisionId: revision.id,
            agreementAt: null,
            suppliedByName: "Customer",
            suppliedByContactId: null,
            channel: "email",
            externalReference: null,
        },
    );
    expect(acceptance.status, JSON.stringify(acceptance.body)).toBe(200);
    const acceptedQuote = await call(owner, `/quotations/${quote.body.id as string}`, "GET", orgId);
    const item = (assetId: string | null, unresolved: string | null) => ({
        sourceRevisionLineId: revision.lines[0]!.id,
        scopeDescription: "Inspect physical unit",
        allocatedQuantity: "1",
        allocatedUnit: "unit",
        partyId: null,
        assetRequirement: "required",
        assetId,
        unresolvedAssetDescription: unresolved,
        serviceMode: "physical_intake",
    });
    const order = await call(owner, "/work-orders", "POST", orgId, {
        quoteId: quote.body.id,
        acceptanceId: acceptance.body.id,
        acceptedRevisionId: revision.id,
        expectedQuoteVersion: acceptedQuote.body.version,
        expectedRequestVersion: request.body.version,
        siteId: site.body.id,
        reference: `WO-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        items: [item(asset.body.id as string, null), item(null, "Unlabelled unit")],
    });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    const orderId = order.body.id as string;
    const items = order.body.items as Array<{ id: string; version: number }>;
    const intakeQueue = await call(
        owner,
        "/service-management/queues?kind=intake_needed",
        "GET",
        orgId,
    );
    expect(intakeQueue.status, JSON.stringify(intakeQueue.body)).toBe(200);
    expect(
        (intakeQueue.body.data as Array<{ workOrderId: string }>).filter(
            (row) => row.workOrderId === orderId,
        ),
    ).toHaveLength(2);
    const receivedAt = new Date().toISOString();
    const knownInput = {
        workOrderId: orderId,
        expectedOrderVersion: order.body.version,
        itemIds: [items[0]!.id],
        assetId: asset.body.id,
        intakeDescription: "Pump with tag",
        observedCondition: "Surface wear",
        accessories: ["Cable", "Case"],
        receivedAt,
        responsibleActorName: "Intake technician",
        responsiblePartyId: null,
        coordination: {
            custody: { subject: "recording_organization" },
            location: { subject: "site", siteId: site.body.id, locationDescription: "Intake shop" },
        },
        expectedAssetVersion: ownership.body.assetVersion,
        idempotencyKey: randomUUID(),
    };
    const failed = await call(owner, "/receipts", "POST", orgId, {
        ...knownInput,
        idempotencyKey: randomUUID(),
        coordination: {
            ...knownInput.coordination,
            location: {
                subject: "site",
                siteId: foreignSite.body.id,
                locationDescription: "Other shop",
            },
        },
    });
    expect(failed.status, JSON.stringify(failed.body)).toBe(404);
    const foreignItem = await call(owner, "/receipts", "POST", orgId, {
        ...knownInput,
        itemIds: [randomUUID()],
        idempotencyKey: randomUUID(),
    });
    expect(foreignItem.status).toBe(404);
    expect((await call(owner, `/receipts/work-orders/${orderId}`, "GET", orgId)).body.data).toEqual(
        [],
    );
    const before = await call(
        owner,
        `/assets/${asset.body.id as string}/relationships/current`,
        "GET",
        orgId,
    );
    expect(before.body).toMatchObject({ custody: null, location: null });
    const recorded = await call(owner, "/receipts", "POST", orgId, knownInput);
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    expect(recorded.body).toMatchObject({
        custodyStatus: "applied",
        assetId: asset.body.id,
        accessories: ["Cable", "Case"],
        version: 1,
    });
    const afterIntake = await call(
        owner,
        "/service-management/queues?kind=intake_needed",
        "GET",
        orgId,
    );
    expect(afterIntake.status, JSON.stringify(afterIntake.body)).toBe(200);
    expect(
        (afterIntake.body.data as Array<{ workItemId: string }>).some(
            (row) => row.workItemId === items[0]!.id,
        ),
    ).toBe(false);
    const relationship = await call(
        owner,
        `/assets/${asset.body.id as string}/relationships/current`,
        "GET",
        orgId,
    );
    expect(relationship.body).toMatchObject({
        ownership: { partyId: customer.body.id },
        custody: { subject: "recording_organization" },
        location: { siteId: site.body.id },
    });
    expect((await call(owner, "/receipts", "POST", orgId, knownInput)).body.id).toBe(
        recorded.body.id,
    );
    const conflicting = await call(owner, "/receipts", "POST", orgId, {
        ...knownInput,
        observedCondition: "Different condition",
    });
    expect(conflicting.status).toBe(409);
    const foreign = await call(owner, "/receipts", "POST", orgId, {
        ...knownInput,
        idempotencyKey: randomUUID(),
        assetId: foreignAsset.body.id,
        expectedAssetVersion: foreignAsset.body.version,
    });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    const corrected = await call(
        owner,
        `/receipts/${recorded.body.id as string}/correct`,
        "POST",
        orgId,
        {
            expectedVersion: 1,
            expectedOrderVersion: order.body.version,
            idempotencyKey: randomUUID(),
            reason: "Condition verified",
            observedCondition: "Light surface wear",
        },
    );
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200);
    expect(corrected.body.version).toBe(2);
    expect(corrected.body.corrections).toHaveLength(1);
    const timeline = await call(
        owner,
        `/service-management/requests/${request.body.id as string}/timeline`,
        "GET",
        orgId,
    );
    expect(timeline.status, JSON.stringify(timeline.body)).toBe(200);
    const events = timeline.body.data as Array<{
        source: string;
        kind: string;
        receiptId: string | null;
    }>;
    expect(
        events.some(
            (event) =>
                event.source === "receipt" &&
                event.kind === "recorded" &&
                event.receiptId === recorded.body.id,
        ),
    ).toBe(true);
    expect(
        events.some(
            (event) =>
                event.source === "receipt" &&
                event.kind === "corrected" &&
                event.receiptId === recorded.body.id,
        ),
    ).toBe(true);
    expect(
        events.some(
            (event) => event.source === "asset_registry" && event.receiptId === recorded.body.id,
        ),
    ).toBe(true);
    expect(
        (timeline.body.currentAssets as Array<{ id: string; name: string }>).some(
            (row) => row.id === asset.body.id && row.name === "Known unit",
        ),
    ).toBe(true);
    const staleCorrection = await call(
        owner,
        `/receipts/${recorded.body.id as string}/correct`,
        "POST",
        orgId,
        {
            expectedVersion: 1,
            expectedOrderVersion: order.body.version,
            idempotencyKey: randomUUID(),
            reason: "Stale observation",
            observedCondition: "Untrusted",
        },
    );
    expect(staleCorrection.status).toBe(409);
    const unknown = await call(owner, "/receipts", "POST", orgId, {
        ...knownInput,
        itemIds: [items[1]!.id],
        assetId: null,
        expectedAssetVersion: undefined,
        idempotencyKey: randomUUID(),
        intakeDescription: "Unlabelled unit",
        receivedAt: new Date().toISOString(),
    });
    expect(unknown.status, JSON.stringify(unknown.body)).toBe(201);
    expect(unknown.body.custodyStatus).toBe("pending");
    const reconciled = await call(
        owner,
        `/receipts/${unknown.body.id as string}/correct`,
        "POST",
        orgId,
        {
            expectedVersion: 1,
            expectedOrderVersion: order.body.version,
            idempotencyKey: randomUUID(),
            reason: "Serial number identified",
            assetId: secondAsset.body.id,
            expectedAssetVersion: secondAsset.body.version,
        },
    );
    expect(reconciled.status, JSON.stringify(reconciled.body)).toBe(200);
    expect(reconciled.body.custodyStatus).toBe("applied");
    expect((reconciled.body.corrections as Array<{ kind: string }>)[0]!.kind).toBe("reconciled");
    const secondRelationship = await call(
        owner,
        `/assets/${secondAsset.body.id as string}/relationships/current`,
        "GET",
        orgId,
    );
    const locationCorrected = await call(
        owner,
        `/receipts/${unknown.body.id as string}/correct`,
        "POST",
        orgId,
        {
            expectedVersion: reconciled.body.version,
            expectedOrderVersion: order.body.version,
            idempotencyKey: randomUUID(),
            reason: "Location was not established by intake",
            coordination: { custody: { subject: "recording_organization" } },
            expectedAssetVersion: secondRelationship.body.assetVersion,
        },
    );
    expect(locationCorrected.status, JSON.stringify(locationCorrected.body)).toBe(200);
    const correctedRelationship = await call(
        owner,
        `/assets/${secondAsset.body.id as string}/relationships/current`,
        "GET",
        orgId,
    );
    expect(correctedRelationship.body).toMatchObject({
        custody: { subject: "recording_organization" },
        location: null,
    });
    const ready = await call(
        owner,
        `/work-orders/${orderId}/items/${items[0]!.id}/ready`,
        "POST",
        orgId,
        {
            expectedOrderVersion: order.body.version,
            expectedItemVersion: items[0]!.version,
            reason: "Intake and identity verified",
        },
    );
    expect(ready.status, JSON.stringify(ready.body)).toBe(200);
    const voidInput = {
        expectedVersion: corrected.body.version,
        expectedOrderVersion: ready.body.version,
        idempotencyKey: randomUUID(),
        reason: "Intake was recorded against the wrong unit",
        expectedAssetVersion: relationship.body.assetVersion,
        void: true,
    };
    const voided = await call(
        owner,
        `/receipts/${recorded.body.id as string}/correct`,
        "POST",
        orgId,
        voidInput,
    );
    expect(voided.status, JSON.stringify(voided.body)).toBe(200);
    expect(voided.body.voidedAt).not.toBeNull();
    expect((voided.body.corrections as Array<{ kind: string }>)[1]!.kind).toBe("voided");
    expect(
        (
            await call(
                owner,
                `/receipts/${recorded.body.id as string}/correct`,
                "POST",
                orgId,
                voidInput,
            )
        ).body.version,
    ).toBe(voided.body.version);
    const afterVoid = await call(
        owner,
        `/assets/${asset.body.id as string}/relationships/current`,
        "GET",
        orgId,
    );
    expect(afterVoid.body).toMatchObject({
        ownership: { partyId: customer.body.id },
        custody: null,
        location: null,
    });
    const assetHistory = await call(
        owner,
        `/assets/${asset.body.id as string}/history`,
        "GET",
        orgId,
    );
    expect(assetHistory.status).toBe(200);
    expect(
        (assetHistory.body.data as Array<{ source: string; sourceReferenceId: string }>).some(
            (entry) => entry.source === "receipt" && entry.sourceReferenceId === recorded.body.id,
        ),
    ).toBe(true);
    const currentOrder = await call(owner, `/work-orders/${orderId}`, "GET", orgId);
    const itemAfterVoid = currentOrder.body.items as Array<{
        id: string;
        status: string;
        version: number;
    }>;
    expect(itemAfterVoid.find((row) => row.id === items[0]!.id)?.status).toBe("planned");
    const invalidReady = await call(
        owner,
        `/work-orders/${orderId}/items/${items[0]!.id}/ready`,
        "POST",
        orgId,
        {
            expectedOrderVersion: currentOrder.body.version,
            expectedItemVersion: itemAfterVoid.find((row) => row.id === items[0]!.id)?.version,
            reason: "Try voided intake",
        },
    );
    expect(invalidReady.status).toBe(409);
    const unresolvedItem = itemAfterVoid.find((row) => row.id === items[1]!.id)!;
    const identifiedItem = await call(
        owner,
        `/work-orders/${orderId}/items/${unresolvedItem.id}`,
        "PATCH",
        orgId,
        {
            expectedOrderVersion: currentOrder.body.version,
            expectedItemVersion: unresolvedItem.version,
            reason: "Identify received unit",
            assetId: secondAsset.body.id,
        },
    );
    expect(identifiedItem.status, JSON.stringify(identifiedItem.body)).toBe(200);
    const identifiedRow = (
        identifiedItem.body.items as Array<{ id: string; version: number }>
    ).find((row) => row.id === unresolvedItem.id)!;
    const identifiedReady = await call(
        owner,
        `/work-orders/${orderId}/items/${unresolvedItem.id}/ready`,
        "POST",
        orgId,
        {
            expectedOrderVersion: identifiedItem.body.version,
            expectedItemVersion: identifiedRow.version,
            reason: "Reconciled intake verified",
        },
    );
    expect(identifiedReady.status, JSON.stringify(identifiedReady.body)).toBe(200);
    const custodyChanged = await call(
        owner,
        `/assets/${secondAsset.body.id as string}/relationships/start`,
        "POST",
        orgId,
        {
            expectedVersion: correctedRelationship.body.assetVersion,
            kind: "custody",
            subject: "party",
            partyId: customer.body.id,
            effectiveAt: new Date().toISOString(),
        },
    );
    expect(custodyChanged.status, JSON.stringify(custodyChanged.body)).toBe(201);
    const currentIdentified = (
        identifiedReady.body.items as Array<{ id: string; version: number }>
    ).find((row) => row.id === unresolvedItem.id)!;
    const backToPlanned = await call(
        owner,
        `/work-orders/${orderId}/items/${unresolvedItem.id}/planned`,
        "POST",
        orgId,
        {
            expectedOrderVersion: identifiedReady.body.version,
            expectedItemVersion: currentIdentified.version,
            reason: "Recheck custody",
        },
    );
    expect(backToPlanned.status, JSON.stringify(backToPlanned.body)).toBe(200);
    const plannedRow = (backToPlanned.body.items as Array<{ id: string; version: number }>).find(
        (row) => row.id === unresolvedItem.id,
    )!;
    const staleCustody = await call(
        owner,
        `/work-orders/${orderId}/items/${unresolvedItem.id}/ready`,
        "POST",
        orgId,
        {
            expectedOrderVersion: backToPlanned.body.version,
            expectedItemVersion: plannedRow.version,
            reason: "Stale receipt custody",
        },
    );
    expect(staleCustody.status).toBe(409);
    expect(
        (await call(owner, `/receipts/${recorded.body.id as string}`, "GET", southId)).status,
    ).toBe(404);
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
    expect(
        (await call(viewer, `/receipts/${recorded.body.id as string}`, "GET", orgId)).status,
    ).toBe(200);
    expect((await call(viewer, `/receipts/work-orders/${orderId}`, "GET", orgId)).status).toBe(200);
    expect((await call(viewer, "/receipts", "POST", orgId, knownInput)).status).toBe(403);
    const members = await call(owner, "/organizations/current/members", "GET", orgId);
    const membershipId = (members.body.data as Array<{ email: string; membershipId: string }>).find(
        (member) => member.email === "member@example.test",
    )?.membershipId;
    const suspended = await fetch(`${api}/organizations/current/members/${membershipId}/suspend`, {
        method: "POST",
        headers: { authorization: `Bearer ${owner}`, "x-ardenfold-organization-id": orgId },
    });
    expect(suspended.status).toBe(204);
    expect(
        (await call(viewer, `/receipts/${recorded.body.id as string}`, "GET", orgId)).status,
    ).toBe(403);
    const audit = await call(owner, "/audit-events", "GET", orgId);
    expect(JSON.stringify(audit.body)).toContain("receipt.recorded");
    expect(JSON.stringify(audit.body)).toContain("receipt.reconciled");
});
