import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001/api/v1";
const identity = "http://127.0.0.1:4010";

async function ownerToken(): Promise<string> {
    const response = await fetch(`${identity}/test/access-token?identity=user_e2e_owner`);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
}

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

test("party API preserves tenant isolation, version conflicts, details and audit", async () => {
    const token = await ownerToken();
    const firstOrg = await request(token, "/organizations", "POST", undefined, {
        name: "Party Registry North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    const secondOrg = await request(token, "/organizations", "POST", undefined, {
        name: "Party Registry South",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(firstOrg.status).toBe(201);
    expect(secondOrg.status).toBe(201);
    const northId = firstOrg.body.id as string;
    const southId = secondOrg.body.id as string;

    const north = await request(token, "/parties", "POST", northId, {
        kind: "organization",
        displayName: "Shared Name",
        roles: ["customer", "provider"],
    });
    const south = await request(token, "/parties", "POST", southId, {
        kind: "organization",
        displayName: "Shared Name",
        roles: ["customer"],
    });
    expect(north.status).toBe(201);
    expect(south.status).toBe(201);
    const northPartyId = north.body.id as string;
    const southPartyId = south.body.id as string;

    const crossRead = await request(token, `/parties/${southPartyId}`, "GET", northId);
    expect(crossRead.status).toBe(404);

    const firstIdentifier = await request(
        token,
        `/parties/${northPartyId}/identifiers`,
        "POST",
        northId,
        {
            expectedVersion: 1,
            type: "tax_id",
            originalValue: "TAX-007",
        },
    );
    const secondIdentifier = await request(
        token,
        `/parties/${southPartyId}/identifiers`,
        "POST",
        southId,
        {
            expectedVersion: 1,
            type: "tax_id",
            originalValue: "TAX-007",
        },
    );
    expect(firstIdentifier.status).toBe(201);
    expect(secondIdentifier.status).toBe(201);
    expect(firstIdentifier.body.identifiers as unknown[]).toHaveLength(1);

    const conflict = await request(token, `/parties/${northPartyId}`, "PATCH", northId, {
        expectedVersion: 1,
        displayName: "Stale edit",
    });
    expect(conflict.status).toBe(409);

    const contact = await request(token, `/parties/${northPartyId}/contacts`, "POST", northId, {
        expectedVersion: 2,
        displayName: "Test Contact",
        isPrimary: true,
    });
    expect(contact.status).toBe(201);
    const contacts = contact.body.contacts as Array<{ id: string }>;
    expect(contacts).toHaveLength(1);

    const channel = await request(
        token,
        `/parties/${northPartyId}/contacts/${contacts[0]!.id}/channels`,
        "POST",
        northId,
        {
            expectedVersion: 3,
            type: "email",
            value: "contact@example.test",
        },
    );
    expect(channel.status).toBe(201);

    const address = await request(token, `/parties/${northPartyId}/addresses`, "POST", northId, {
        expectedVersion: 4,
        label: "Office",
        line1: "Main Street 1",
        locality: "Lima",
        countryCode: "pe",
    });
    expect(address.status).toBe(201);
    expect((address.body.addresses as Array<{ countryCode: string }>)[0]?.countryCode).toBe("PE");

    const list = await request(token, "/parties?limit=1", "GET", northId);
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).map((item) => item.id)).toEqual([
        northPartyId,
    ]);

    const archive = await request(token, `/parties/${northPartyId}/archive`, "POST", northId, {
        expectedVersion: 5,
    });
    expect(archive.status).toBe(201);
    expect(archive.body.status).toBe("archived");
    const restore = await request(token, `/parties/${northPartyId}/restore`, "POST", northId, {
        expectedVersion: 6,
    });
    expect(restore.status).toBe(201);
    expect(restore.body.status).toBe("active");

    const audit = await request(token, "/audit-events?limit=50", "GET", northId);
    expect(audit.status).toBe(200);
    const actions = (audit.body.data as Array<{ action: string }>).map((event) => event.action);
    expect(actions).toContain("party.created");
    expect(actions).toContain("party.archived");
    expect(actions).toContain("party.restored");
});
