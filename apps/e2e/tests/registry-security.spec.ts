import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001/api/v1";
const identity = "http://127.0.0.1:4010";

async function token(user: "user_e2e_owner" | "user_e2e_member"): Promise<string> {
    const response = await fetch(`${identity}/test/access-token?identity=${user}`);
    expect(response.status).toBe(200);
    return ((await response.json()) as { access_token: string }).access_token;
}

async function call(
    bearer: string,
    path: string,
    method: "GET" | "POST" | "DELETE",
    organizationId?: string,
    body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${api}${path}`, {
        method,
        headers: {
            authorization: `Bearer ${bearer}`,
            ...(organizationId ? { "x-ardenfold-organization-id": organizationId } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
        status: response.status,
        body: response.status === 204 ? {} : ((await response.json()) as Record<string, unknown>),
    };
}

test("registry import permissions and revoked membership block existing tokens", async () => {
    const owner = await token("user_e2e_owner");
    const viewer = await token("user_e2e_member");
    const north = await call(owner, "/organizations", "POST", undefined, {
        name: "Security North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    const south = await call(owner, "/organizations", "POST", undefined, {
        name: "Security South",
        defaultLocale: "es",
        defaultTimeZone: "UTC",
    });
    expect(north.status).toBe(201);
    expect(south.status).toBe(201);
    const northId = north.body.id as string;
    const southId = south.body.id as string;

    const party = await call(owner, "/parties", "POST", northId, {
        kind: "organization",
        displayName: "Synthetic customer",
        roles: ["customer"],
    });
    expect(party.status).toBe(201);
    const southParty = await call(owner, "/parties", "POST", southId, {
        kind: "organization",
        displayName: "Synthetic provider",
        roles: ["provider"],
    });
    expect(southParty.status).toBe(201);
    expect(
        (await call(owner, `/parties/${southParty.body.id as string}`, "GET", northId)).status,
    ).toBe(404);

    const invitation = await call(owner, "/organizations/current/invitations", "POST", northId, {
        email: "member@example.test",
        role: "viewer",
    });
    expect(invitation.status).toBe(201);
    expect(
        (
            await call(viewer, "/invitations/accept", "POST", undefined, {
                token: invitation.body.acceptanceToken,
            })
        ).status,
    ).toBe(201);

    const sessionId = randomUUID();
    const csv =
        "template_version,display_name,kind,roles,legal_name,identifier_type,identifier_value\n1,Synthetic import,organization,customer,,tax_id,TEST-55\n";
    expect(
        (
            await call(owner, "/registry/imports/preview", "POST", northId, {
                sessionId,
                kind: "party",
                csv,
            })
        ).status,
    ).toBe(201);
    expect((await call(viewer, "/parties", "GET", northId)).status).toBe(200);
    expect((await call(viewer, `/parties/${party.body.id as string}`, "GET", northId)).status).toBe(
        200,
    );
    expect((await call(viewer, "/parties", "GET", southId)).status).toBe(403);
    expect(
        (
            await call(viewer, "/registry/imports/preview", "POST", northId, {
                sessionId: randomUUID(),
                kind: "party",
                csv,
            })
        ).status,
    ).toBe(403);
    expect((await call(viewer, `/registry/imports/${sessionId}`, "GET", northId)).status).toBe(404);
    expect(
        (
            await call(viewer, `/registry/imports/${sessionId}/commit`, "POST", northId, {
                approvedRows: [2],
            })
        ).status,
    ).toBe(404);

    const members = await call(owner, "/organizations/current/members", "GET", northId);
    const membershipId = (members.body.data as Array<{ email: string; membershipId: string }>).find(
        (member) => member.email === "member@example.test",
    )?.membershipId;
    expect(membershipId).toBeTruthy();
    expect(
        (await call(owner, `/organizations/current/members/${membershipId}`, "DELETE", northId))
            .status,
    ).toBe(204);
    expect((await call(viewer, "/parties", "GET", northId)).status).toBe(403);
    expect((await call(viewer, `/parties/${party.body.id as string}`, "GET", northId)).status).toBe(
        403,
    );
    expect(
        (
            await call(viewer, "/registry/imports/preview", "POST", northId, {
                sessionId: randomUUID(),
                kind: "party",
                csv,
            })
        ).status,
    ).toBe(403);
});
