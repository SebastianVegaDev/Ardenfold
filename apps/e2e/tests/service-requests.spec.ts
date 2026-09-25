import { expect, test } from "@playwright/test";
import { Client } from "pg";

const api = "http://127.0.0.1:3001/api/v1";
const identity = "http://127.0.0.1:4010";

async function token(identityName: string): Promise<string> {
    const response = await fetch(`${identity}/test/access-token?identity=${identityName}`);
    expect(response.ok).toBe(true);
    return ((await response.json()) as { access_token: string }).access_token;
}

async function request(
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

async function organization(accessToken: string, name: string): Promise<string> {
    const result = await request(accessToken, "/organizations", "POST", undefined, {
        name,
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(result.status).toBe(201);
    return result.body.id as string;
}

async function party(accessToken: string, orgId: string, role: "customer" | "provider") {
    const result = await request(accessToken, "/parties", "POST", orgId, {
        kind: "organization",
        displayName: "Shared Industrial Customer",
        roles: [role],
    });
    expect(result.status).toBe(201);
    return result.body.id as string;
}

test("service requests validate references, retain scope history and guard lifecycle edits", async () => {
    const owner = await token("user_e2e_owner");
    const north = await organization(owner, "Request Operations North");
    const south = await organization(owner, "Request Operations South");
    const customer = await party(owner, north, "customer");
    const otherCustomer = await party(owner, south, "customer");
    const localOtherCustomer = await party(owner, north, "customer");
    const provider = await party(owner, north, "provider");
    const contact = await request(owner, `/parties/${customer}/contacts`, "POST", north, {
        expectedVersion: 1,
        displayName: "North requester",
    });
    const otherContact = await request(owner, `/parties/${otherCustomer}/contacts`, "POST", south, {
        expectedVersion: 1,
        displayName: "South requester",
    });
    const localOtherContact = await request(
        owner,
        `/parties/${localOtherCustomer}/contacts`,
        "POST",
        north,
        {
            expectedVersion: 1,
            displayName: "Other north requester",
        },
    );
    expect(contact.status).toBe(201);
    expect(otherContact.status).toBe(201);
    expect(localOtherContact.status).toBe(201);
    const contactId = (contact.body.contacts as Array<{ id: string }>)[0]!.id;
    const otherContactId = (otherContact.body.contacts as Array<{ id: string }>)[0]!.id;
    const localOtherContactId = (localOtherContact.body.contacts as Array<{ id: string }>)[0]!.id;
    const site = await request(owner, "/organizations/current/sites", "POST", north, {
        name: "North shop",
    });
    const otherSite = await request(owner, "/organizations/current/sites", "POST", south, {
        name: "South shop",
    });
    expect(site.status).toBe(201);
    expect(otherSite.status).toBe(201);
    const asset = await request(owner, "/assets", "POST", north, { displayName: "Pump A" });
    const otherAsset = await request(owner, "/assets", "POST", south, { displayName: "Pump B" });
    expect(asset.status).toBe(201);
    expect(otherAsset.status).toBe(201);

    const base = {
        customerPartyId: customer,
        requesterContactId: contactId,
        siteId: site.body.id,
        summary: "Investigate pump issue",
        customerContext: "Pressure drops intermittently",
        scopeItems: [
            { description: "Inspect known pump", assetId: asset.body.id },
            { description: "Inspect another pump", unidentifiedAssetDescription: "Serial unknown" },
        ],
    };
    const created = await request(owner, "/service-requests", "POST", north, base);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("active");
    expect(created.body.version).toBe(1);
    const id = created.body.id as string;
    const scope = created.body.scopeItems as Array<{ id: string; assetId: string | null }>;
    expect(scope).toHaveLength(2);
    expect(scope[1]!.assetId).toBeNull();

    const invalidReferences = [
        { ...base, customerPartyId: otherCustomer },
        { ...base, customerPartyId: provider },
        { ...base, requesterContactId: otherContactId },
        { ...base, requesterContactId: localOtherContactId },
        { ...base, siteId: otherSite.body.id },
        { ...base, scopeItems: [{ description: "Wrong asset", assetId: otherAsset.body.id }] },
    ];
    for (const invalid of invalidReferences) {
        const result = await request(owner, "/service-requests", "POST", north, invalid);
        expect([404, 409]).toContain(result.status);
    }
    const crossCustomer = await request(owner, "/service-requests", "POST", north, {
        ...base,
        customerPartyId: otherCustomer,
    });
    expect((crossCustomer.body.error as { code: string }).code).toBe("CUSTOMER_NOT_FOUND");
    expect((await request(owner, `/service-requests/${id}`, "GET", south)).status).toBe(404);
    expect(
        (
            await request(owner, `/service-requests/${id}`, "PATCH", south, {
                expectedVersion: 1,
                reason: "Wrong tenant",
                summary: "Wrong tenant",
            })
        ).status,
    ).toBe(404);
    expect(
        (await request(owner, "/service-requests?status=active", "GET", north)).body.data,
    ).toEqual([expect.objectContaining({ id })]);

    const archiveAsset = await request(
        owner,
        `/assets/${asset.body.id as string}/archive`,
        "POST",
        north,
        {
            expectedVersion: 1,
        },
    );
    expect(archiveAsset.status).toBe(201);
    expect((await request(owner, `/service-requests/${id}`, "GET", north)).body.scopeItems).toEqual(
        expect.arrayContaining([expect.objectContaining({ assetId: asset.body.id })]),
    );
    const archivedReference = await request(owner, "/service-requests", "POST", north, {
        ...base,
        scopeItems: [{ description: "New use of archived asset", assetId: asset.body.id }],
    });
    expect(archivedReference.status).toBe(409);
    expect((archivedReference.body.error as { code: string }).code).toBe(
        "REQUESTED_ASSET_ARCHIVED",
    );

    const update = await request(owner, `/service-requests/${id}`, "PATCH", north, {
        expectedVersion: 1,
        reason: "Customer clarified scope",
        customerContext: "Inspection requested this week",
        scopeItems: [{ id: scope[0]!.id, description: "Inspect known pump", assetId: null }],
    });
    expect(update.status).toBe(200);
    expect(update.body.version).toBe(2);
    expect(update.body.scopeItems as unknown[]).toHaveLength(1);
    expect((update.body.scopeItems as Array<{ assetId: string | null }>)[0]!.assetId).toBeNull();
    const stale = await request(owner, `/service-requests/${id}`, "PATCH", north, {
        expectedVersion: 1,
        reason: "Stale",
        summary: "Stale edit",
    });
    expect(stale.status).toBe(409);
    expect((stale.body.error as { code: string }).code).toBe("VERSION_CONFLICT");

    const closed = await request(owner, `/service-requests/${id}/close`, "POST", north, {
        expectedVersion: 2,
        reason: "Request completed without quote",
    });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe("closed");
    expect(closed.body.version).toBe(3);
    const terminalEdit = await request(owner, `/service-requests/${id}`, "PATCH", north, {
        expectedVersion: 3,
        reason: "Try reopening",
        summary: "Reopened",
    });
    expect(terminalEdit.status).toBe(409);
    expect((terminalEdit.body.error as { code: string }).code).toBe("SERVICE_REQUEST_TERMINAL");
    expect((await request(owner, `/service-requests/${id}`, "GET", north)).body.status).toBe(
        "closed",
    );

    const audit = await request(owner, "/audit-events?limit=100", "GET", north);
    expect(audit.status).toBe(200);
    const actions = (audit.body.data as Array<{ action: string }>).map((event) => event.action);
    expect(actions).toContain("service_request.created");
    expect(actions).toContain("service_request.updated");
    expect(actions).toContain("service_request.closed");
    const archivedCustomer = await request(owner, `/parties/${customer}/archive`, "POST", north, {
        expectedVersion: 2,
    });
    expect(archivedCustomer.status).toBe(201);
    expect((await request(owner, `/service-requests/${id}`, "GET", north)).status).toBe(200);

    const database = new Client({
        connectionString:
            process.env.DATABASE_MIGRATION_URL ??
            "postgresql://ardenfold_e2e_migrator:e2e-migration-password@127.0.0.1:55432/ardenfold_e2e",
    });
    await database.connect();
    try {
        const history = await database.query<{
            version: number;
            kind: string;
            snapshot: { status: string; scopeItems: Array<{ assetId: string | null }> };
        }>(
            `SELECT version, kind, snapshot FROM service_request_history_entries
             WHERE organization_id = $1 AND request_id = $2 ORDER BY version`,
            [north, id],
        );
        expect(history.rows.map((entry) => [entry.version, entry.kind])).toEqual([
            [1, "created"],
            [2, "updated"],
            [3, "closed"],
        ]);
        expect(history.rows[0]!.snapshot.scopeItems[0]!.assetId).toBe(asset.body.id);
        expect(history.rows[1]!.snapshot.scopeItems[0]!.assetId).toBeNull();
        expect(history.rows[2]!.snapshot.status).toBe("closed");
    } finally {
        await database.end();
    }
});

test("service request access follows current permission and membership", async () => {
    const owner = await token("user_e2e_owner");
    const orgId = await organization(owner, "Request Permission Tenant");
    const customer = await party(owner, orgId, "customer");
    const created = await request(owner, "/service-requests", "POST", orgId, {
        customerPartyId: customer,
        summary: "Unidentified asset at intake",
        requesterName: "Caller",
        scopeItems: [{ description: "Inspect unknown motor" }],
    });
    expect(created.status).toBe(201);
    const requestId = created.body.id as string;

    const invitation = await request(owner, "/organizations/current/invitations", "POST", orgId, {
        email: "member@example.test",
        role: "viewer",
    });
    expect(invitation.status).toBe(201);
    const viewer = await token("user_e2e_member");
    expect(
        (
            await request(viewer, "/invitations/accept", "POST", undefined, {
                token: invitation.body.acceptanceToken,
            })
        ).status,
    ).toBe(201);
    expect((await request(viewer, "/service-requests", "GET", orgId)).status).toBe(200);
    expect(
        (
            await request(viewer, "/service-requests", "POST", orgId, {
                customerPartyId: customer,
                summary: "Forbidden",
            })
        ).status,
    ).toBe(403);
    const members = await request(owner, "/organizations/current/members", "GET", orgId);
    const membershipId = (members.body.data as Array<{ email: string; membershipId: string }>).find(
        (member) => member.email === "member@example.test",
    )?.membershipId;
    expect(membershipId).toBeDefined();
    const suspension = await fetch(`${api}/organizations/current/members/${membershipId}/suspend`, {
        method: "POST",
        headers: { authorization: `Bearer ${owner}`, "x-ardenfold-organization-id": orgId },
    });
    expect(suspension.status).toBe(204);
    expect((await request(viewer, `/service-requests/${requestId}`, "GET", orgId)).status).toBe(
        403,
    );
    const removal = await fetch(`${api}/organizations/current/members/${membershipId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${owner}`, "x-ardenfold-organization-id": orgId },
    });
    expect(removal.status).toBe(204);
    expect((await request(viewer, `/service-requests/${requestId}`, "GET", orgId)).status).toBe(
        403,
    );
    const cancelled = await request(owner, `/service-requests/${requestId}/cancel`, "POST", orgId, {
        expectedVersion: 1,
        reason: "Customer withdrew request",
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect(
        (
            await request(owner, `/service-requests/${requestId}/close`, "POST", orgId, {
                expectedVersion: 2,
                reason: "Cannot close cancelled request",
            })
        ).status,
    ).toBe(409);
});

test("service request pagination preserves exact creation order and cursor filters", async () => {
    const owner = await token("user_e2e_owner");
    const orgId = await organization(owner, "Request Pagination Tenant");
    const customer = await party(owner, orgId, "customer");
    const createdIds: string[] = [];
    for (let number = 1; number <= 3; number += 1) {
        const created = await request(owner, "/service-requests", "POST", orgId, {
            customerPartyId: customer,
            summary: `Service need ${number}`,
        });
        expect(created.status).toBe(201);
        createdIds.push(created.body.id as string);
    }
    const listedIds: string[] = [];
    let cursor: string | null = null;
    do {
        const path = cursor
            ? `/service-requests?limit=1&cursor=${encodeURIComponent(cursor)}`
            : "/service-requests?limit=1";
        const page = await request(owner, path, "GET", orgId);
        expect(page.status).toBe(200);
        listedIds.push(...(page.body.data as Array<{ id: string }>).map((item) => item.id));
        cursor = page.body.nextCursor as string | null;
        if (cursor) {
            const wrongFilter = await request(
                owner,
                `/service-requests?limit=1&status=closed&cursor=${encodeURIComponent(cursor)}`,
                "GET",
                orgId,
            );
            expect(wrongFilter.status).toBe(400);
            expect((wrongFilter.body.error as { code: string }).code).toBe(
                "INVALID_SERVICE_REQUEST_CURSOR",
            );
        }
    } while (cursor);
    expect(listedIds).toEqual([...createdIds].reverse());
});
