import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001/api/v1";
const identity = "http://127.0.0.1:4010";

async function ownerToken(): Promise<string> {
    const response = await fetch(`${identity}/test/access-token?identity=user_e2e_owner`);
    expect(response.ok).toBe(true);
    return ((await response.json()) as { access_token: string }).access_token;
}

async function request(token: string, path: string, organizationId?: string, body?: unknown) {
    const response = await fetch(`${api}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
            authorization: `Bearer ${token}`,
            ...(organizationId ? { "x-ardenfold-organization-id": organizationId } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function ids(result: { body: Record<string, unknown> }): string[] {
    return (result.body.data as Array<{ id: string }>).map((row) => row.id);
}

test("registry search is tenant-scoped, normalized, filtered and cursor-stable", async () => {
    const token = await ownerToken();
    const north = await request(token, "/organizations", undefined, {
        name: "Search North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    const south = await request(token, "/organizations", undefined, {
        name: "Search South",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(north.status).toBe(201);
    expect(south.status).toBe(201);
    const northId = north.body.id as string;
    const southId = south.body.id as string;

    const northParty = await request(token, "/parties", northId, {
        kind: "organization",
        displayName: "Alpha supplier",
        legalName: "Northern Trading",
        roles: ["provider"],
    });
    const secondParty = await request(token, "/parties", northId, {
        kind: "organization",
        displayName: "Beta supplier",
        roles: ["provider"],
    });
    const secretParty = await request(token, "/parties", southId, {
        kind: "organization",
        displayName: "Secret south partner",
        roles: ["customer"],
    });
    expect(northParty.status).toBe(201);
    expect(secondParty.status).toBe(201);
    expect(secretParty.status).toBe(201);
    const partyId = northParty.body.id as string;
    const partyIdentifier = await fetch(`${api}/parties/${partyId}/identifiers`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            "x-ardenfold-organization-id": northId,
            "content-type": "application/json",
        },
        body: JSON.stringify({ expectedVersion: 1, type: "tax_id", originalValue: "TAX-007" }),
    });
    expect(partyIdentifier.status).toBe(201);
    const contact = await request(token, `/parties/${partyId}/contacts`, northId, {
        expectedVersion: 2,
        displayName: "Mira Coordinator",
        isPrimary: true,
    });
    expect(contact.status).toBe(201);
    const contactId = (contact.body.contacts as Array<{ id: string }>)[0]!.id;
    const channel = await request(
        token,
        `/parties/${partyId}/contacts/${contactId}/channels`,
        northId,
        {
            expectedVersion: 3,
            type: "email",
            value: "mira@example.test",
        },
    );
    expect(channel.status).toBe(201);
    const partyByLegal = await request(token, "/parties?q=Northern", northId);
    const partyByIdentifier = await request(token, "/parties?q=tax007", northId);
    expect(ids(partyByLegal)).toEqual([partyId]);
    expect(ids(partyByIdentifier)).toEqual([partyId]);
    expect(ids(await request(token, "/parties?kind=individual", northId))).toEqual([]);
    expect(ids(await request(token, "/parties?q=mira%40example.test", northId))).toEqual([partyId]);
    expect(ids(await request(token, "/parties?q=Secret", northId))).toEqual([]);
    const duplicate = await request(
        token,
        `/parties/${secondParty.body.id as string}/identifiers`,
        northId,
        {
            expectedVersion: 1,
            type: "tax_id",
            originalValue: "TAX 007",
        },
    );
    expect(duplicate.status).toBe(201);
    const duplicateDetail = await request(token, `/parties/${partyId}`, northId);
    expect(duplicateDetail.body.duplicateCandidates).toEqual([
        {
            id: secondParty.body.id,
            displayName: "Beta supplier",
            matchedType: "tax_id",
        },
    ]);

    const firstPage = await request(
        token,
        "/parties?limit=1&sort=name_desc&role=provider",
        northId,
    );
    expect(ids(firstPage)).toEqual([secondParty.body.id]);
    const cursor = firstPage.body.nextCursor as string;
    expect(cursor).toBeTruthy();
    const secondPage = await request(
        token,
        `/parties?limit=1&sort=name_desc&role=provider&cursor=${encodeURIComponent(cursor)}`,
        northId,
    );
    expect(ids(secondPage)).toEqual([partyId]);
    expect(
        (
            await request(
                token,
                `/parties?limit=1&sort=name_asc&cursor=${encodeURIComponent(cursor)}`,
                northId,
            )
        ).status,
    ).toBe(400);

    const northAsset = await request(token, "/assets", northId, {
        displayName: "Meter alpha",
        manufacturer: "Northern Instruments",
        model: "MX-1",
        classification: "Electrical",
        identifiers: [{ type: "serial", originalValue: "SER-001" }],
    });
    const secondAsset = await request(token, "/assets", northId, {
        displayName: "Meter beta",
        manufacturer: "Acme",
    });
    const southAsset = await request(token, "/assets", southId, {
        displayName: "Secret south meter",
        identifiers: [{ type: "serial", originalValue: "SOUTH-1" }],
    });
    expect(northAsset.status).toBe(201);
    expect(secondAsset.status).toBe(201);
    expect(southAsset.status).toBe(201);
    const assetId = northAsset.body.id as string;
    expect(ids(await request(token, "/assets?q=Instruments", northId))).toEqual([assetId]);
    expect(ids(await request(token, "/assets?q=ser001", northId))).toEqual([assetId]);
    expect(ids(await request(token, "/assets?q=Electrical", northId))).toEqual([assetId]);
    expect(
        ids(
            await request(
                token,
                "/assets?manufacturer=Northern&model=MX-1&classification=electrical",
                northId,
            ),
        ),
    ).toEqual([assetId]);
    expect(ids(await request(token, "/assets?q=Secret", northId))).toEqual([]);
    expect(ids(await request(token, "/assets?q=SOUTH-1", northId))).toEqual([]);

    const relation = await fetch(`${api}/assets/${assetId}/relationships/start`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            "x-ardenfold-organization-id": northId,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            expectedVersion: 1,
            kind: "ownership",
            subject: "party",
            partyId,
            effectiveAt: "2026-01-01T00:00:00.000Z",
        }),
    });
    expect(relation.status).toBe(201);
    expect(ids(await request(token, "/assets?q=Alpha%20supplier", northId))).toEqual([assetId]);
    const assetPage = await request(token, "/assets?limit=1&sort=name_asc", northId);
    expect(ids(assetPage)).toEqual([assetId]);
    expect(
        ids(
            await request(
                token,
                `/assets?limit=1&sort=name_asc&cursor=${encodeURIComponent(assetPage.body.nextCursor as string)}`,
                northId,
            ),
        ),
    ).toEqual([secondAsset.body.id]);
    expect((await request(token, "/assets?q=x", northId)).status).toBe(400);
});
