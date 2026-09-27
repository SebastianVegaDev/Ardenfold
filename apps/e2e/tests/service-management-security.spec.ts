import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const apiOrigin = "http://127.0.0.1:3001/api/v1";

type Result = { status: number; body: Record<string, unknown> };

async function token(identity: "user_e2e_owner" | "user_e2e_member"): Promise<string> {
    const response = await fetch(`http://127.0.0.1:4010/test/access-token?identity=${identity}`);
    expect(response.status).toBe(200);
    return ((await response.json()) as { access_token: string }).access_token;
}

async function call(
    accessToken: string,
    path: string,
    method = "GET",
    organizationId?: string,
    body?: unknown,
): Promise<Result> {
    const response = await fetch(`${apiOrigin}${path}`, {
        method,
        headers: {
            authorization: `Bearer ${accessToken}`,
            ...(organizationId ? { "x-ardenfold-organization-id": organizationId } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.text();
    return {
        status: response.status,
        body: payload ? (JSON.parse(payload) as Record<string, unknown>) : {},
    };
}

async function createOrganization(owner: string, name: string): Promise<string> {
    const result = await call(owner, "/organizations", "POST", undefined, {
        name,
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(result.status).toBe(201);
    return result.body.id as string;
}

async function createParty(owner: string, orgId: string, name: string): Promise<Result> {
    const result = await call(owner, "/parties", "POST", orgId, {
        kind: "organization",
        displayName: name,
        roles: ["customer"],
    });
    expect(result.status).toBe(201);
    return result;
}

test("M4 commercial basis, operational readiness, tenant isolation and live projections", async ({
    page,
}) => {
    test.setTimeout(120_000);
    const owner = await token("user_e2e_owner");
    const member = await token("user_e2e_member");
    const north = await createOrganization(owner, `M4 North ${randomUUID()}`);
    const south = await createOrganization(owner, `M4 South ${randomUUID()}`);
    const invitation = await call(owner, "/organizations/current/invitations", "POST", north, {
        email: "member@example.test",
        role: "member",
    });
    expect(invitation.status).toBe(201);
    expect(
        (
            await call(member, "/invitations/accept", "POST", undefined, {
                token: invitation.body.acceptanceToken,
            })
        ).status,
    ).toBe(201);
    const members = await call(owner, "/organizations/current/members", "GET", north);
    const membershipId = (members.body.data as Array<{ email: string; membershipId: string }>).find(
        (row) => row.email === "member@example.test",
    )?.membershipId;
    expect(membershipId).toBeDefined();

    const customer = await createParty(owner, north, "M4 Synthetic Customer");
    const foreignCustomer = await createParty(owner, south, "M4 Foreign Customer");
    const contact = await call(
        owner,
        `/parties/${customer.body.id as string}/contacts`,
        "POST",
        north,
        {
            expectedVersion: 1,
            displayName: "Synthetic Contact",
        },
    );
    expect(contact.status).toBe(201);
    const contactId = (contact.body.contacts as Array<{ id: string }>)[0]!.id;
    const site = await call(owner, "/organizations/current/sites", "POST", north, {
        name: "M4 Shop",
    });
    const foreignSite = await call(owner, "/organizations/current/sites", "POST", south, {
        name: "Foreign Shop",
    });
    const asset = await call(owner, "/assets", "POST", north, { displayName: "M4 Pump" });
    const foreignAsset = await call(owner, "/assets", "POST", south, {
        displayName: "Foreign Pump",
    });
    expect(site.status).toBe(201);
    expect(foreignSite.status).toBe(201);
    expect(asset.status).toBe(201);
    expect(foreignAsset.status).toBe(201);
    const ownership = await call(
        owner,
        `/assets/${asset.body.id as string}/relationships/start`,
        "POST",
        north,
        {
            expectedVersion: asset.body.version,
            kind: "ownership",
            subject: "party",
            partyId: customer.body.id,
            effectiveAt: new Date(Date.now() - 60_000).toISOString(),
        },
    );
    expect(ownership.status).toBe(201);

    const requestInput = {
        customerPartyId: customer.body.id,
        requesterContactId: contactId,
        siteId: site.body.id,
        summary: "Inspect synthetic pump",
        scopeItems: [
            { description: "Known pump", assetId: asset.body.id },
            { description: "Unidentified unit", unidentifiedAssetDescription: "Identity pending" },
        ],
    };
    const foreignRequest = await call(owner, "/service-requests", "POST", north, {
        ...requestInput,
        customerPartyId: foreignCustomer.body.id,
    });
    const missingRequest = await call(owner, "/service-requests", "POST", north, {
        ...requestInput,
        customerPartyId: randomUUID(),
    });
    expect(foreignRequest.status).toBe(404);
    expect(foreignRequest.status).toBe(missingRequest.status);
    const createdRequest = await call(owner, "/service-requests", "POST", north, requestInput);
    expect(createdRequest.status).toBe(201);
    const requestId = createdRequest.body.id as string;
    expect(
        (createdRequest.body.scopeItems as Array<{ assetId: string | null }>).map(
            (row) => row.assetId,
        ),
    ).toEqual([asset.body.id, null]);
    expect((await call(owner, `/service-requests/${requestId}`, "GET", south)).status).toBe(404);

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
                description: "Inspect synthetic pump",
                quantity: "2",
                unit: "unit",
                unitPrice: "10.00",
                partyId: null,
                assetId: asset.body.id,
                adjustments: [],
            },
        ],
        adjustments: [],
    };
    const quote = await call(owner, "/quotations", "POST", north, {
        requestId,
        reference: `M4-Q-${randomUUID()}`,
        draft,
    });
    expect(quote.status).toBe(201);
    const quoteId = quote.body.id as string;
    const first = (quote.body.revisions as Array<{ id: string }>)[0]!.id;
    const concurrentEdits = await Promise.all([
        call(owner, `/quotations/${quoteId}/revisions/${first}`, "PATCH", north, {
            expectedVersion: quote.body.version,
            reason: "Owner draft review",
            draft: { ...draft, lines: [{ ...draft.lines[0], unitPrice: "10.50" }] },
        }),
        call(member, `/quotations/${quoteId}/revisions/${first}`, "PATCH", north, {
            expectedVersion: quote.body.version,
            reason: "Member draft review",
            draft: { ...draft, lines: [{ ...draft.lines[0], unitPrice: "11.00" }] },
        }),
    ]);
    expect(concurrentEdits.map((result) => result.status).sort()).toEqual([200, 409]);
    const edited = concurrentEdits.find((result) => result.status === 200)!;
    const firstOffer = await call(
        owner,
        `/quotations/${quoteId}/revisions/${first}/issue`,
        "POST",
        north,
        {
            expectedVersion: edited.body.version,
            channel: "email",
        },
    );
    expect(firstOffer.status).toBe(200);
    expect(
        (
            await call(owner, `/service-requests/${requestId}/cancel`, "POST", north, {
                expectedVersion: createdRequest.body.version,
                reason: "Invalid while quote remains open",
            })
        ).status,
    ).toBe(409);
    const copied = await call(owner, `/quotations/${quoteId}/revisions`, "POST", north, {
        expectedVersion: firstOffer.body.version,
        sourceRevisionId: first,
    });
    expect(copied.status).toBe(201);
    const second = (copied.body.revisions as Array<{ id: string }>)[1]!.id;
    const revised = await call(
        owner,
        `/quotations/${quoteId}/revisions/${second}`,
        "PATCH",
        north,
        {
            expectedVersion: copied.body.version,
            reason: "Agreed final scope",
            draft: { ...draft, lines: [{ ...draft.lines[0], unitPrice: "12.00" }] },
        },
    );
    expect(revised.status).toBe(200);
    const secondOffer = await call(
        owner,
        `/quotations/${quoteId}/revisions/${second}/issue`,
        "POST",
        north,
        {
            expectedVersion: revised.body.version,
            channel: "email",
        },
    );
    expect(secondOffer.status).toBe(200);
    const acceptanceInput = {
        expectedVersion: secondOffer.body.version,
        idempotencyKey: randomUUID(),
        revisionId: second,
        agreementAt: null,
        suppliedByName: "Synthetic Contact",
        suppliedByContactId: contactId,
        channel: "email",
        externalReference: null,
    };
    const concurrentAcceptance = await Promise.all([
        call(owner, `/quotations/${quoteId}/acceptances`, "POST", north, acceptanceInput),
        call(member, `/quotations/${quoteId}/acceptances`, "POST", north, acceptanceInput),
    ]);
    expect(concurrentAcceptance.map((result) => result.status)).toEqual([200, 200]);
    expect(concurrentAcceptance[0].body.id).toBe(concurrentAcceptance[1].body.id);
    const acceptanceId = concurrentAcceptance[0].body.id as string;
    const acceptedQuote = await call(owner, `/quotations/${quoteId}`, "GET", north);
    expect(
        acceptedQuote.body.revisions as Array<{ id: string; status: string; total: string }>,
    ).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ id: first, status: "superseded" }),
            expect.objectContaining({ id: second, status: "accepted", total: "24.00" }),
        ]),
    );
    expect(
        (
            await call(
                owner,
                "/service-management/queues?kind=accepted_unoperationalized",
                "GET",
                north,
            )
        ).body.data,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ acceptanceId })]));

    const orderInput = {
        quoteId,
        acceptanceId,
        acceptedRevisionId: second,
        expectedQuoteVersion: acceptedQuote.body.version,
        expectedRequestVersion: createdRequest.body.version,
        siteId: site.body.id,
        reference: `M4-WO-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        items: [
            {
                sourceRevisionLineId: (
                    acceptedQuote.body.revisions as Array<{
                        id: string;
                        lines: Array<{ id: string }>;
                    }>
                ).find((row) => row.id === second)!.lines[0]!.id,
                scopeDescription: "Physical pump intake",
                allocatedQuantity: "1",
                allocatedUnit: "unit",
                partyId: null,
                assetRequirement: "required",
                assetId: asset.body.id,
                unresolvedAssetDescription: null,
                serviceMode: "physical_intake",
            },
            {
                sourceRevisionLineId: (
                    acceptedQuote.body.revisions as Array<{
                        id: string;
                        lines: Array<{ id: string }>;
                    }>
                ).find((row) => row.id === second)!.lines[0]!.id,
                scopeDescription: "On-site pump inspection",
                allocatedQuantity: "1",
                allocatedUnit: "unit",
                partyId: null,
                assetRequirement: "required",
                assetId: asset.body.id,
                unresolvedAssetDescription: null,
                serviceMode: "no_intake",
            },
        ],
    };
    const foreignOrder = await call(owner, "/work-orders", "POST", north, {
        ...orderInput,
        siteId: foreignSite.body.id,
        idempotencyKey: randomUUID(),
    });
    expect(foreignOrder.status).toBe(404);
    const order = await call(owner, "/work-orders", "POST", north, orderInput);
    expect(order.status).toBe(201);
    const orderId = order.body.id as string;
    const items = order.body.items as Array<{ id: string; version: number; serviceMode: string }>;
    expect(items).toHaveLength(2);
    expect(items.map((row) => row.serviceMode)).toEqual(["physical_intake", "no_intake"]);
    expect((await call(owner, "/work-orders", "POST", north, orderInput)).body.id).toBe(orderId);
    expect((await call(owner, `/work-orders/${orderId}`, "GET", south)).status).toBe(404);
    expect(
        (await call(owner, `/work-orders?assetId=${foreignAsset.body.id as string}`, "GET", north))
            .body.data,
    ).toEqual([]);
    expect(
        (await call(owner, `/work-orders?assetId=${asset.body.id as string}`, "GET", north)).body
            .data,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: orderId })]));
    expect(
        (await call(owner, "/service-management/queues?kind=intake_needed", "GET", north)).body
            .data,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ workItemId: items[0]!.id })]));
    expect(
        (
            await call(
                owner,
                "/service-management/queues?kind=accepted_unoperationalized",
                "GET",
                north,
            )
        ).body.data,
    ).toEqual([]);

    const receiptInput = {
        workOrderId: orderId,
        expectedOrderVersion: order.body.version,
        itemIds: [items[0]!.id],
        assetId: asset.body.id,
        intakeDescription: "Synthetic physical intake",
        observedCondition: "Intact",
        accessories: [],
        receivedAt: new Date().toISOString(),
        responsibleActorName: "Technician",
        responsiblePartyId: null,
        coordination: {
            custody: { subject: "recording_organization" },
            location: { subject: "site", siteId: site.body.id, locationDescription: "M4 Shop" },
        },
        expectedAssetVersion: ownership.body.assetVersion,
        idempotencyKey: randomUUID(),
    };
    const failedReceipt = await call(owner, "/receipts", "POST", north, {
        ...receiptInput,
        idempotencyKey: randomUUID(),
        coordination: {
            ...receiptInput.coordination,
            location: {
                subject: "site",
                siteId: foreignSite.body.id,
                locationDescription: "Foreign Shop",
            },
        },
    });
    expect(failedReceipt.status).toBe(404);
    expect((await call(owner, `/receipts/work-orders/${orderId}`, "GET", north)).body.data).toEqual(
        [],
    );
    const beforeReceipt = await call(
        owner,
        `/assets/${asset.body.id as string}/relationships/current`,
        "GET",
        north,
    );
    expect(beforeReceipt.body).toMatchObject({
        ownership: { partyId: customer.body.id },
        custody: null,
        location: null,
    });
    const receipt = await call(owner, "/receipts", "POST", north, receiptInput);
    expect(receipt.status).toBe(201);
    expect((await call(owner, "/receipts", "POST", north, receiptInput)).body.id).toBe(
        receipt.body.id,
    );
    const afterReceipt = await call(
        owner,
        `/assets/${asset.body.id as string}/relationships/current`,
        "GET",
        north,
    );
    expect(afterReceipt.body).toMatchObject({
        ownership: { partyId: customer.body.id },
        custody: { subject: "recording_organization" },
        location: { siteId: site.body.id },
    });
    expect((await call(owner, `/receipts/${receipt.body.id as string}`, "GET", south)).status).toBe(
        404,
    );
    const readyPhysical = await call(
        owner,
        `/work-orders/${orderId}/items/${items[0]!.id}/ready`,
        "POST",
        north,
        {
            expectedOrderVersion: order.body.version,
            expectedItemVersion: items[0]!.version,
            reason: "Intake verified",
        },
    );
    expect(readyPhysical.status).toBe(200);
    const readyOnSite = await call(
        owner,
        `/work-orders/${orderId}/items/${items[1]!.id}/ready`,
        "POST",
        north,
        {
            expectedOrderVersion: readyPhysical.body.version,
            expectedItemVersion: items[1]!.version,
            reason: "On-site scope prepared without receipt",
        },
    );
    expect(readyOnSite.status).toBe(200);
    expect(
        (
            await call(
                owner,
                `/work-orders/${orderId}/items/${items[1]!.id}/ready`,
                "POST",
                north,
                {
                    expectedOrderVersion: order.body.version,
                    expectedItemVersion: items[1]!.version,
                    reason: "Stale transition",
                },
            )
        ).status,
    ).toBe(409);
    const readyOrder = await call(owner, `/work-orders/${orderId}/ready`, "POST", north, {
        expectedVersion: readyOnSite.body.version,
        reason: "Both items prepared",
    });
    expect(readyOrder.status).toBe(200);
    expect(readyOrder.body.status).toBe("ready");
    expect(
        (await call(owner, `/receipts/work-orders/${orderId}`, "GET", north)).body.data,
    ).toHaveLength(1);
    const commercialAfter = await call(owner, `/quotations/${quoteId}`, "GET", north);
    expect(
        (commercialAfter.body.revisions as Array<{ id: string; total: string }>).find(
            (row) => row.id === second,
        )?.total,
    ).toBe("24.00");
    expect(commercialAfter.body.acceptances).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: acceptanceId, revisionId: second })]),
    );

    const renamedParty = await call(
        owner,
        `/parties/${customer.body.id as string}`,
        "PATCH",
        north,
        {
            expectedVersion: contact.body.version,
            displayName: "M4 Current Customer",
        },
    );
    expect(renamedParty.status).toBe(200);
    const currentAsset = await call(owner, `/assets/${asset.body.id as string}`, "GET", north);
    const renamedAsset = await call(owner, `/assets/${asset.body.id as string}`, "PATCH", north, {
        expectedVersion: currentAsset.body.version,
        displayName: "M4 Current Pump",
    });
    expect(renamedAsset.status).toBe(200);
    const timeline = await call(
        owner,
        `/service-management/requests/${requestId}/timeline`,
        "GET",
        north,
    );
    expect(timeline.status).toBe(200);
    expect(timeline.body.currentCustomer).toMatchObject({ name: "M4 Current Customer" });
    expect(timeline.body.currentAssets).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "M4 Current Pump" })]),
    );
    const events = timeline.body.data as Array<{
        source: string;
        kind: string;
        revisionId: string | null;
        workOrderId: string | null;
        receiptId: string | null;
    }>;
    expect(
        events.some(
            (row) => row.source === "quote" && row.revisionId === second && row.kind === "accepted",
        ),
    ).toBe(true);
    expect(events.some((row) => row.source === "work_order" && row.workOrderId === orderId)).toBe(
        true,
    );
    expect(events.some((row) => row.source === "work_item" && row.workOrderId === orderId)).toBe(
        true,
    );
    expect(
        events.some((row) => row.source === "receipt" && row.receiptId === receipt.body.id),
    ).toBe(true);
    expect(
        events.some((row) => row.source === "asset_registry" && row.receiptId === receipt.body.id),
    ).toBe(true);
    expect(
        (await call(owner, `/service-management/requests/${requestId}/timeline`, "GET", south))
            .status,
    ).toBe(404);
    expect(
        (await call(owner, "/service-management/queues?kind=active_work", "GET", south)).body.data,
    ).toEqual([]);
    expect(
        (
            await call(
                owner,
                `/quotations?customerPartyId=${foreignCustomer.body.id as string}`,
                "GET",
                north,
            )
        ).body.data,
    ).toEqual([]);
    const audit = await call(owner, "/audit-events", "GET", north);
    expect(audit.status).toBe(200);
    expect(JSON.stringify(audit.body)).toContain("receipt.recorded");
    expect(JSON.stringify((await call(owner, "/audit-events", "GET", south)).body)).not.toContain(
        orderId,
    );

    expect(
        (
            await call(
                owner,
                `/organizations/current/members/${membershipId}/role`,
                "PATCH",
                north,
                { role: "viewer" },
            )
        ).status,
    ).toBe(204);
    expect((await call(member, `/work-orders/${orderId}`, "GET", north)).status).toBe(200);
    expect(
        (
            await call(member, `/work-orders/${orderId}/cancel`, "POST", north, {
                expectedVersion: readyOrder.body.version,
                reason: "Viewer cannot cancel",
            })
        ).status,
    ).toBe(403);
    expect(
        (await call(member, `/service-management/requests/${requestId}/timeline`, "GET", north))
            .status,
    ).toBe(200);
    expect(
        (await call(owner, `/organizations/current/members/${membershipId}/suspend`, "POST", north))
            .status,
    ).toBe(204);
    expect(
        (await call(member, `/service-management/requests/${requestId}/timeline`, "GET", north))
            .status,
    ).toBe(403);
    expect(
        (await call(owner, `/organizations/current/members/${membershipId}`, "DELETE", north))
            .status,
    ).toBe(204);
    expect((await call(member, `/work-orders/${orderId}`, "GET", north)).status).toBe(403);

    await page.goto("/en/sign-in");
    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await page.getByTestId("user_e2e_owner").click();
    await expect(page).toHaveURL(/\/en\/app(?:\?|$)/u);
    const selector = page.getByRole("combobox", { name: "Organization selector" });
    await Promise.all([
        page.waitForResponse(
            (response) =>
                response.url().includes("/auth/organization") &&
                response.request().method() === "POST",
        ),
        selector.selectOption(north),
    ]);
    await page.goto(`/en/app/operations?kind=active_work`);
    await expect(page.getByRole("link", { name: orderInput.reference })).toBeVisible();
    await page.goto(`/en/app/service-requests/${requestId}/timeline`);
    await expect(page.getByRole("heading", { name: "Request business timeline" })).toBeVisible();
    await page.goto(`/es/app/service-requests/${requestId}/timeline`);
    await expect(
        page.getByRole("heading", { name: "Cronología de negocio de la solicitud" }),
    ).toBeVisible();
});
