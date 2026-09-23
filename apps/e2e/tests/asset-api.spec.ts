import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001/api/v1";
const identity = "http://127.0.0.1:4010";

async function ownerToken(): Promise<string> {
    const response = await fetch(`${identity}/test/access-token?identity=user_e2e_owner`);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
}

async function memberToken(): Promise<string> {
    const response = await fetch(`${identity}/test/access-token?identity=user_e2e_member`);
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

test("asset API preserves tenant identity, duplicate signals and versioned lifecycle", async () => {
    const token = await ownerToken();
    const north = await request(token, "/organizations", "POST", undefined, {
        name: "Asset Registry North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    const south = await request(token, "/organizations", "POST", undefined, {
        name: "Asset Registry South",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(north.status).toBe(201);
    expect(south.status).toBe(201);
    const northId = north.body.id as string;
    const southId = south.body.id as string;

    const first = await request(token, "/assets", "POST", northId, {
        displayName: "North meter",
        manufacturer: "Acme",
        identifiers: [{ type: "serial_number", originalValue: "SN 42" }],
    });
    const second = await request(token, "/assets", "POST", southId, {
        displayName: "South meter",
        identifiers: [{ type: "serial_number", originalValue: "SN-42" }],
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.duplicateCandidates).toEqual([]);
    expect(second.body.duplicateCandidates).toEqual([]);
    const firstId = first.body.id as string;
    const secondId = second.body.id as string;

    const invitation = await request(token, "/organizations/current/invitations", "POST", northId, {
        email: "member@example.test",
        role: "viewer",
    });
    expect(invitation.status).toBe(201);
    const viewerToken = await memberToken();
    const acceptance = await request(viewerToken, "/invitations/accept", "POST", undefined, {
        token: invitation.body.acceptanceToken,
    });
    expect(acceptance.status).toBe(201);
    expect((await request(viewerToken, "/assets", "GET", northId)).status).toBe(200);
    expect(
        (
            await request(viewerToken, "/assets", "POST", northId, {
                displayName: "Forbidden asset",
            })
        ).status,
    ).toBe(403);
    expect(
        (
            await request(viewerToken, `/assets/${firstId}`, "PATCH", northId, {
                expectedVersion: 1,
                displayName: "Forbidden edit",
            })
        ).status,
    ).toBe(403);
    expect(
        (
            await request(viewerToken, `/assets/${firstId}/archive`, "POST", northId, {
                expectedVersion: 1,
            })
        ).status,
    ).toBe(403);

    const third = await request(token, "/assets", "POST", northId, {
        displayName: "Another north meter",
        identifiers: [
            { type: "serial_number", originalValue: "SN-42" },
            { type: "customer_code", originalValue: "CUST-1" },
        ],
    });
    expect(third.status).toBe(201);
    expect(third.body.duplicateCandidates).toEqual([
        { id: firstId, displayName: "North meter", matchedType: "serial_number" },
    ]);
    expect(third.body.identifiers as unknown[]).toHaveLength(2);
    const thirdId = third.body.id as string;

    const crossRead = await request(token, `/assets/${secondId}`, "GET", northId);
    expect(crossRead.status).toBe(404);
    const crossUpdate = await request(token, `/assets/${secondId}`, "PATCH", northId, {
        expectedVersion: 1,
        displayName: "Illegal update",
    });
    expect(crossUpdate.status).toBe(404);
    const stale = await request(token, `/assets/${thirdId}`, "PATCH", northId, {
        expectedVersion: 2,
        displayName: "Stale update",
    });
    expect(stale.status).toBe(409);

    const identifierId = (third.body.identifiers as Array<{ id: string; type: string }>).find(
        (identifier) => identifier.type === "serial_number",
    )!.id;
    const changed = await request(
        token,
        `/assets/${thirdId}/identifiers/${identifierId}`,
        "PATCH",
        northId,
        { expectedVersion: 1, type: "serial_number", originalValue: "SN-43" },
    );
    expect(changed.status).toBe(200);
    expect(changed.body.version).toBe(2);
    expect(
        (changed.body.identifiers as Array<{ status: string }>).map((item) => item.status).sort(),
    ).toEqual(["active", "active", "retired"]);
    expect(changed.body.duplicateCandidates).toEqual([]);

    const inService = await request(token, `/assets/${thirdId}/lifecycle`, "POST", northId, {
        expectedVersion: 2,
        lifecycle: "in_service",
    });
    expect(inService.status).toBe(201);
    expect(inService.body.lifecycle).toBe("in_service");
    const invalidTransition = await request(
        token,
        `/assets/${thirdId}/lifecycle`,
        "POST",
        northId,
        { expectedVersion: 3, lifecycle: "registered" },
    );
    expect(invalidTransition.status).toBe(409);

    const list = await request(token, "/assets?status=active&lifecycle=in_service", "GET", northId);
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).map((item) => item.id)).toEqual([thirdId]);

    const archive = await request(token, `/assets/${thirdId}/archive`, "POST", northId, {
        expectedVersion: 3,
    });
    expect(archive.status).toBe(201);
    expect(archive.body.status).toBe("archived");
    const blockedEdit = await request(token, `/assets/${thirdId}`, "PATCH", northId, {
        expectedVersion: 4,
        displayName: "Blocked edit",
    });
    expect(blockedEdit.status).toBe(409);
    const restore = await request(token, `/assets/${thirdId}/restore`, "POST", northId, {
        expectedVersion: 4,
    });
    expect(restore.status).toBe(201);
    expect(restore.body.status).toBe("active");

    const audit = await request(token, "/audit-events?limit=50", "GET", northId);
    expect(audit.status).toBe(200);
    const actions = (audit.body.data as Array<{ action: string }>).map((event) => event.action);
    expect(actions).toContain("asset.created");
    expect(actions).toContain("asset.identifier_changed");
    expect(actions).toContain("asset.archived");
    expect(actions).toContain("asset.restored");
});
