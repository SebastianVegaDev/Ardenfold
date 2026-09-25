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

test("quote revisions retain accepted terms and enforce commercial decisions", async () => {
    const owner = await token("user_e2e_owner");
    const north = await call(owner, "/organizations", "POST", undefined, {
        name: "Quotation North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    const south = await call(owner, "/organizations", "POST", undefined, {
        name: "Quotation South",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(north.status).toBe(201);
    expect(south.status).toBe(201);
    const northId = north.body.id as string;
    const southId = south.body.id as string;
    const customer = await call(owner, "/parties", "POST", northId, {
        kind: "organization",
        displayName: "Commercial customer",
        roles: ["customer"],
    });
    const otherCustomer = await call(owner, "/parties", "POST", southId, {
        kind: "organization",
        displayName: "Other customer",
        roles: ["customer"],
    });
    expect(customer.status).toBe(201);
    expect(otherCustomer.status).toBe(201);
    const request = await call(owner, "/service-requests", "POST", northId, {
        customerPartyId: customer.body.id,
        summary: "Inspect equipment",
        scopeItems: [{ description: "Inspect two devices" }],
    });
    expect(request.status).toBe(201);
    const foreignAsset = await call(owner, "/assets", "POST", southId, {
        displayName: "Foreign asset",
    });
    expect(foreignAsset.status).toBe(201);
    const draft = {
        currencyCode: "PEN",
        paymentTerms: "Due on completion",
        deliveryTerms: null,
        serviceLocation: "Customer site",
        intakeExpectations: "No intake",
        exclusions: null,
        validUntil: null,
        lines: [
            {
                description: "Inspection",
                quantity: "3",
                unit: "hour",
                unitPrice: "0.335",
                partyId: null,
                assetId: null,
                adjustments: [{ label: "Discount", amount: "-0.01" }],
            },
        ],
        adjustments: [],
    };
    const quote = await call(owner, "/quotations", "POST", northId, {
        requestId: request.body.id,
        reference: `Q-${randomUUID()}`,
        draft,
    });
    expect(quote.status, JSON.stringify(quote.body)).toBe(201);
    const foreignLine = await call(owner, "/quotations", "POST", northId, {
        requestId: request.body.id,
        reference: `Q-${randomUUID()}`,
        draft: { ...draft, lines: [{ ...draft.lines[0], assetId: foreignAsset.body.id }] },
    });
    expect(foreignLine.status).toBe(404);
    const quoteId = quote.body.id as string;
    const first = (quote.body.revisions as Array<{ id: string }>)[0]!.id;
    const editedCurrency = await call(
        owner,
        `/quotations/${quoteId}/revisions/${first}`,
        "PATCH",
        northId,
        {
            expectedVersion: quote.body.version,
            reason: "Change proposal currency",
            draft: { ...draft, currencyCode: "USD" },
        },
    );
    expect(editedCurrency.status, JSON.stringify(editedCurrency.body)).toBe(200);
    expect(
        (editedCurrency.body.revisions as Array<{ currencyCode: string }>)[0]!.currencyCode,
    ).toBe("USD");
    const edited = await call(
        owner,
        `/quotations/${quoteId}/revisions/${first}`,
        "PATCH",
        northId,
        {
            expectedVersion: editedCurrency.body.version,
            reason: "Customer requested PEN",
            draft,
        },
    );
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect((await call(owner, `/quotations/${quoteId}`, "GET", southId)).status).toBe(404);
    expect(
        (
            await call(owner, "/quotations", "POST", northId, {
                requestId: randomUUID(),
                reference: `Q-${randomUUID()}`,
                draft,
            })
        ).status,
    ).toBe(404);
    expect(
        (
            await call(
                owner,
                `/service-requests/${request.body.id as string}/cancel`,
                "POST",
                northId,
                { expectedVersion: 1, reason: "No longer needed" },
            )
        ).status,
    ).toBe(409);
    const issued = await call(
        owner,
        `/quotations/${quoteId}/revisions/${first}/issue`,
        "POST",
        northId,
        { expectedVersion: edited.body.version, channel: "phone" },
    );
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect((issued.body.revisions as Array<{ total: string }>)[0]!.total).toBe("1.00");
    const lockedEdit = await call(
        owner,
        `/quotations/${quoteId}/revisions/${first}`,
        "PATCH",
        northId,
        {
            expectedVersion: issued.body.version,
            reason: "Attempt to rewrite issued offer",
            draft,
        },
    );
    expect(lockedEdit.status).toBe(409);
    const key = randomUUID();
    const acceptance = {
        expectedVersion: issued.body.version,
        idempotencyKey: key,
        revisionId: first,
        agreementAt: null,
        suppliedByName: "Customer contact",
        suppliedByContactId: null,
        channel: "phone",
        externalReference: null,
    };
    const accepted = await call(
        owner,
        `/quotations/${quoteId}/acceptances`,
        "POST",
        northId,
        acceptance,
    );
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.revisionId).toBe(first);
    const replay = await call(
        owner,
        `/quotations/${quoteId}/acceptances`,
        "POST",
        northId,
        acceptance,
    );
    expect(replay).toEqual(accepted);
    const conflictingReplay = await call(
        owner,
        `/quotations/${quoteId}/acceptances`,
        "POST",
        northId,
        { ...acceptance, channel: "email" },
    );
    expect(conflictingReplay.status).toBe(409);
    const afterAcceptance = await call(owner, `/quotations/${quoteId}`, "GET", northId);
    const copied = await call(owner, `/quotations/${quoteId}/revisions`, "POST", northId, {
        expectedVersion: afterAcceptance.body.version,
        sourceRevisionId: first,
    });
    expect(copied.status, JSON.stringify(copied.body)).toBe(201);
    const revisions = copied.body.revisions as Array<{ id: string; status: string; total: string }>;
    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toEqual(
        expect.objectContaining({ id: first, status: "accepted", total: "1.00" }),
    );
    expect(revisions[1]!.status).toBe("draft");
    const staleEdit = await call(
        owner,
        `/quotations/${quoteId}/revisions/${revisions[1]!.id}`,
        "PATCH",
        northId,
        { expectedVersion: afterAcceptance.body.version, reason: "Customer feedback", draft },
    );
    expect(staleEdit.status).toBe(409);
    const forbiddenIssue = await call(
        owner,
        `/quotations/${quoteId}/revisions/${revisions[1]!.id}/issue`,
        "POST",
        northId,
        { expectedVersion: copied.body.version, channel: "phone" },
    );
    expect(forbiddenIssue.status).toBe(409);
    const withdrawn = await call(
        owner,
        `/quotations/${quoteId}/acceptances/withdraw`,
        "POST",
        northId,
        { expectedVersion: copied.body.version, reason: "Agreement withdrawn" },
    );
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200);
    const replayAfterWithdrawal = await call(
        owner,
        `/quotations/${quoteId}/acceptances`,
        "POST",
        northId,
        acceptance,
    );
    expect(replayAfterWithdrawal.status).toBe(200);
    expect(replayAfterWithdrawal.body.id).toBe(accepted.body.id);
    expect(replayAfterWithdrawal.body.withdrawnAt).not.toBeNull();
    const reissued = await call(
        owner,
        `/quotations/${quoteId}/revisions/${revisions[1]!.id}/issue`,
        "POST",
        northId,
        { expectedVersion: withdrawn.body.version, channel: "phone" },
    );
    expect(reissued.status, JSON.stringify(reissued.body)).toBe(200);
    expect((reissued.body.revisions as Array<{ id: string; total: string }>)[0]!.total).toBe(
        "1.00",
    );
    const rejected = await call(owner, `/quotations/${quoteId}/reject`, "POST", northId, {
        expectedVersion: reissued.body.version,
        revisionId: revisions[1]!.id,
        reason: "Customer declined",
        channel: "phone",
        suppliedByName: null,
    });
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect((rejected.body.revisions as Array<{ status: string }>)[1]!.status).toBe("rejected");
    expect((await call(owner, `/quotations/${quoteId}?status=open`, "GET", southId)).status).toBe(
        404,
    );
    expect((await call(owner, "/quotations?status=open", "GET", southId)).body.data).toEqual([]);

    const secondQuote = await call(owner, "/quotations", "POST", northId, {
        requestId: request.body.id,
        reference: `Q-${randomUUID()}`,
        draft: { ...draft, lines: [{ ...draft.lines[0], description: "Separate assessment" }] },
    });
    expect(secondQuote.status).toBe(201);
    const secondQuoteId = secondQuote.body.id as string;
    const firstOfferId = (secondQuote.body.revisions as Array<{ id: string }>)[0]!.id;
    const firstOffer = await call(
        owner,
        `/quotations/${secondQuoteId}/revisions/${firstOfferId}/issue`,
        "POST",
        northId,
        { expectedVersion: secondQuote.body.version, channel: "in-person" },
    );
    expect(firstOffer.status).toBe(200);
    const copiedOffer = await call(
        owner,
        `/quotations/${secondQuoteId}/revisions`,
        "POST",
        northId,
        { expectedVersion: firstOffer.body.version, sourceRevisionId: firstOfferId },
    );
    expect(copiedOffer.status).toBe(201);
    const nextOfferId = (copiedOffer.body.revisions as Array<{ id: string }>)[1]!.id;
    const nextOffer = await call(
        owner,
        `/quotations/${secondQuoteId}/revisions/${nextOfferId}/issue`,
        "POST",
        northId,
        { expectedVersion: copiedOffer.body.version, channel: "in-person" },
    );
    expect(nextOffer.status, JSON.stringify(nextOffer.body)).toBe(200);
    expect(
        (nextOffer.body.revisions as Array<{ status: string }>).map((revision) => revision.status),
    ).toEqual(["superseded", "offered"]);
    expect(
        (nextOffer.body.history as Array<{ kind: string }>).map((entry) => entry.kind),
    ).toContain("revision.superseded");
    const staleAcceptance = await call(
        owner,
        `/quotations/${secondQuoteId}/acceptances`,
        "POST",
        northId,
        {
            ...acceptance,
            idempotencyKey: randomUUID(),
            expectedVersion: nextOffer.body.version,
            revisionId: firstOfferId,
        },
    );
    expect(staleAcceptance.status).toBe(409);

    const invitation = await call(owner, "/organizations/current/invitations", "POST", northId, {
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
    expect((await call(viewer, `/quotations/${quoteId}`, "GET", northId)).status).toBe(200);
    expect(
        (
            await call(viewer, `/quotations/${quoteId}/acceptances`, "POST", northId, {
                ...acceptance,
                idempotencyKey: randomUUID(),
            })
        ).status,
    ).toBe(403);
    const members = await call(owner, "/organizations/current/members", "GET", northId);
    const membershipId = (members.body.data as Array<{ email: string; membershipId: string }>).find(
        (member) => member.email === "member@example.test",
    )?.membershipId;
    expect(membershipId).toBeDefined();
    const suspension = await fetch(`${api}/organizations/current/members/${membershipId}/suspend`, {
        method: "POST",
        headers: { authorization: `Bearer ${owner}`, "x-ardenfold-organization-id": northId },
    });
    expect(suspension.status).toBe(204);
    expect((await call(viewer, `/quotations/${quoteId}`, "GET", northId)).status).toBe(403);

    const expiredDraft = await call(owner, "/quotations", "POST", northId, {
        requestId: request.body.id,
        reference: `Q-${randomUUID()}`,
        draft: { ...draft, validUntil: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(expiredDraft.status).toBe(201);
    const expiredRevisionId = (expiredDraft.body.revisions as Array<{ id: string }>)[0]!.id;
    const invalidIssue = await call(
        owner,
        `/quotations/${expiredDraft.body.id as string}/revisions/${expiredRevisionId}/issue`,
        "POST",
        northId,
        { expectedVersion: expiredDraft.body.version, channel: "phone" },
    );
    expect(invalidIssue.status).toBe(409);
});
