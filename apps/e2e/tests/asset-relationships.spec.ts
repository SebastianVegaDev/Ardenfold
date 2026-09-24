import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001/api/v1";

async function request(
    token: string,
    path: string,
    method = "GET",
    organizationId?: string,
    body?: unknown,
) {
    const response = await fetch(`${api}${path}`, {
        method,
        headers: {
            authorization: `Bearer ${token}`,
            ...(organizationId ? { "x-ardenfold-organization-id": organizationId } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("asset relationships remain independent, temporal and tenant-scoped", async () => {
    const tokenResponse = await fetch(
        "http://127.0.0.1:4010/test/access-token?identity=user_e2e_owner",
    );
    expect(tokenResponse.ok).toBe(true);
    const token = ((await tokenResponse.json()) as { access_token: string }).access_token;
    const north = await request(token, "/organizations", "POST", undefined, {
        name: "Temporal Assets North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    const south = await request(token, "/organizations", "POST", undefined, {
        name: "Temporal Assets South",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(north.status).toBe(201);
    expect(south.status).toBe(201);
    const northId = north.body.id as string;
    const southId = south.body.id as string;

    const northParty = await request(token, "/parties", "POST", northId, {
        kind: "organization",
        displayName: "North owner",
        roles: ["customer"],
    });
    const southParty = await request(token, "/parties", "POST", southId, {
        kind: "organization",
        displayName: "South owner",
        roles: ["customer"],
    });
    expect(northParty.status).toBe(201);
    expect(southParty.status).toBe(201);
    const northPartyId = northParty.body.id as string;
    const southPartyId = southParty.body.id as string;

    const site = await request(token, "/organizations/current/sites", "POST", northId, {
        name: "North laboratory",
        code: "LAB-N",
    });
    expect(site.status).toBe(201);
    const foreignSite = await request(token, "/organizations/current/sites", "POST", southId, {
        name: "South laboratory",
        code: "LAB-S",
    });
    expect(foreignSite.status).toBe(201);
    const address = await request(token, `/parties/${northPartyId}/addresses`, "POST", northId, {
        expectedVersion: 1,
        label: "Receiving office",
        line1: "Main Street 1",
        locality: "Lima",
        countryCode: "PE",
    });
    expect(address.status).toBe(201);
    const addressId = (address.body.addresses as Array<{ id: string }>)[0]!.id;
    const foreignAddress = await request(
        token,
        `/parties/${southPartyId}/addresses`,
        "POST",
        southId,
        {
            expectedVersion: 1,
            label: "Foreign office",
            line1: "South Street 1",
            locality: "Lima",
            countryCode: "PE",
        },
    );
    expect(foreignAddress.status).toBe(201);
    const foreignAddressId = (foreignAddress.body.addresses as Array<{ id: string }>)[0]!.id;

    const asset = await request(token, "/assets", "POST", northId, {
        displayName: "Temporal meter",
    });
    expect(asset.status).toBe(201);
    const assetId = asset.body.id as string;
    const path = `/assets/${assetId}`;
    const initial = await request(token, `${path}/relationships/current`, "GET", northId);
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({ ownership: null, custody: null, location: null });

    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
    const owner = await request(token, `${path}/relationships/start`, "POST", northId, {
        expectedVersion: 1,
        kind: "ownership",
        subject: "party",
        partyId: northPartyId,
        effectiveAt: at(10),
    });
    expect(owner.status).toBe(201);
    expect((owner.body.ownership as { partyId: string }).partyId).toBe(northPartyId);
    expect(owner.body.custody).toBeNull();

    const custody = await request(token, `${path}/relationships/start`, "POST", northId, {
        expectedVersion: 2,
        kind: "custody",
        subject: "recording_organization",
        effectiveAt: at(9),
    });
    expect(custody.status).toBe(201);
    expect((custody.body.ownership as { partyId: string }).partyId).toBe(northPartyId);
    expect((custody.body.custody as { subject: string }).subject).toBe("recording_organization");

    const location = await request(token, `${path}/relationships/start`, "POST", northId, {
        expectedVersion: 3,
        kind: "location",
        subject: "site",
        siteId: site.body.id,
        locationDescription: "Bench 2",
        effectiveAt: at(8),
    });
    expect(location.status).toBe(201);
    expect((location.body.location as { siteId: string }).siteId).toBe(site.body.id);

    const crossTenant = await request(token, `${path}/relationships/start`, "POST", northId, {
        expectedVersion: 4,
        kind: "ownership",
        subject: "party",
        partyId: southPartyId,
        effectiveAt: at(7),
    });
    expect(crossTenant.status).toBe(404);
    const crossTenantSite = await request(token, `${path}/relationships/correct`, "POST", northId, {
        expectedVersion: 4,
        kind: "location",
        subject: "site",
        siteId: foreignSite.body.id,
        locationDescription: "Foreign bench",
        effectiveAt: at(7),
        reason: "Incorrect site",
    });
    expect(crossTenantSite.status).toBe(404);
    const crossTenantAddress = await request(
        token,
        `${path}/relationships/correct`,
        "POST",
        northId,
        {
            expectedVersion: 4,
            kind: "location",
            subject: "party_address",
            partyAddressId: foreignAddressId,
            locationDescription: "Foreign shelf",
            effectiveAt: at(7),
            reason: "Incorrect address",
        },
    );
    expect(crossTenantAddress.status).toBe(404);
    const invalidShape = await request(token, `${path}/relationships/start`, "POST", northId, {
        expectedVersion: 4,
        kind: "custody",
        subject: "site",
        siteId: site.body.id,
        locationDescription: "Bench 3",
        effectiveAt: at(7),
    });
    expect(invalidShape.status).toBe(400);

    const transferred = await request(token, `${path}/relationships/start`, "POST", northId, {
        expectedVersion: 4,
        kind: "ownership",
        subject: "recording_organization",
        effectiveAt: at(6),
    });
    expect(transferred.status).toBe(201);
    expect((transferred.body.ownership as { subject: string }).subject).toBe(
        "recording_organization",
    );
    expect((transferred.body.custody as { subject: string }).subject).toBe(
        "recording_organization",
    );

    const corrected = await request(token, `${path}/relationships/correct`, "POST", northId, {
        expectedVersion: 5,
        kind: "custody",
        subject: "party",
        partyId: northPartyId,
        effectiveAt: at(9),
        reason: "Correct receiving record",
    });
    expect(corrected.status).toBe(201);
    expect((corrected.body.custody as { partyId: string }).partyId).toBe(northPartyId);
    expect((corrected.body.ownership as { subject: string }).subject).toBe(
        "recording_organization",
    );

    const ended = await request(token, `${path}/relationships/end`, "POST", northId, {
        expectedVersion: 6,
        kind: "location",
        effectiveAt: at(5),
    });
    expect(ended.status).toBe(201);
    expect(ended.body.location).toBeNull();
    const placedAtAddress = await request(token, `${path}/relationships/start`, "POST", northId, {
        expectedVersion: 7,
        kind: "location",
        subject: "party_address",
        partyAddressId: addressId,
        locationDescription: "Receiving shelf",
        effectiveAt: at(4),
    });
    expect(placedAtAddress.status).toBe(201);
    expect((placedAtAddress.body.location as { partyAddressId: string }).partyAddressId).toBe(
        addressId,
    );

    const overlap = await request(token, `${path}/relationships/end`, "POST", northId, {
        expectedVersion: 8,
        kind: "ownership",
        effectiveAt: at(7),
    });
    expect(overlap.status).toBe(409);
    const stale = await request(token, `${path}/relationships/end`, "POST", northId, {
        expectedVersion: 7,
        kind: "location",
        effectiveAt: at(3),
    });
    expect(stale.status).toBe(409);

    const revisions = await request(token, `${path}/relationships/history`, "GET", northId);
    expect(revisions.status).toBe(200);
    expect(
        (revisions.body.data as Array<{ supersededAt: string | null }>).some(
            (row) => row.supersededAt !== null,
        ),
    ).toBe(true);
    const business = await request(token, `${path}/history`, "GET", northId);
    expect(business.status).toBe(200);
    const events = (business.body.data as Array<{ event: string }>).map((row) => row.event);
    expect(events).toContain("asset_created");
    expect(events).toContain("relationship_started");
    expect(events).toContain("relationship_corrected");
    expect(events).toContain("relationship_ended");
    expect((await request(token, `${path}/history`, "GET", southId)).status).toBe(404);

    const audit = await request(token, "/audit-events?limit=50", "GET", northId);
    expect(audit.status).toBe(200);
    expect((audit.body.data as Array<{ action: string }>).map((row) => row.action)).toContain(
        "asset.relationship_corrected",
    );
});
