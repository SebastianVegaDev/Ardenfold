import { randomUUID } from "node:crypto";

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

test("party import previews safely, commits approved rows once and isolates sessions", async () => {
    const token = await ownerToken();
    const north = await request(token, "/organizations", undefined, {
        name: "Import North",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    const south = await request(token, "/organizations", undefined, {
        name: "Import South",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(north.status).toBe(201);
    expect(south.status).toBe(201);
    const northId = north.body.id as string;
    const southId = south.body.id as string;
    const southParty = await request(token, "/parties", southId, {
        kind: "organization",
        displayName: "Private South",
        roles: ["customer"],
    });
    expect(southParty.status).toBe(201);
    const southIdentifier = await request(
        token,
        `/parties/${southParty.body.id}/identifiers`,
        southId,
        {
            expectedVersion: 1,
            type: "tax_id",
            originalValue: "SOUTH-77",
        },
    );
    expect(southIdentifier.status).toBe(201);
    const northParty = await request(token, "/parties", northId, {
        kind: "organization",
        displayName: "Known North",
        roles: ["provider"],
    });
    const northIdentifier = await request(
        token,
        `/parties/${northParty.body.id}/identifiers`,
        northId,
        {
            expectedVersion: 1,
            type: "tax_id",
            originalValue: "NORTH-42",
        },
    );
    expect(northIdentifier.status).toBe(201);

    const sessionId = randomUUID();
    const csv =
        [
            "template_version,display_name,kind,roles,legal_name,identifier_type,identifier_value",
            "1,Imported South-looking,organization,customer,,tax_id,SOUTH-77",
            "1,Bad row,invalid,customer,,tax_id,INVALID-1",
            "1,Imported North-looking,organization,provider,,tax_id,NORTH-42",
        ].join("\r\n") + "\r\n";
    const preview = await request(token, "/registry/imports/preview", northId, {
        sessionId,
        kind: "party",
        csv,
    });
    expect(preview.status).toBe(201);
    const rows = preview.body.rows as Array<{
        rowNumber: number;
        status: string;
        errors: Array<{ code: string }>;
        warnings: Array<{ code: string }>;
        duplicateCandidates: Array<{ id: string }>;
    }>;
    expect(rows.map((row) => row.status)).toEqual(["valid", "rejected", "valid"]);
    expect(rows[0]!.duplicateCandidates).toEqual([]);
    expect(rows[1]!.errors.some((error) => error.code === "INVALID_KIND")).toBe(true);
    expect(rows[2]!.duplicateCandidates.map((candidate) => candidate.id)).toEqual([
        northParty.body.id,
    ]);
    expect(rows[2]!.warnings.map((warning) => warning.code)).toContain("POSSIBLE_DUPLICATE");
    expect((await request(token, "/parties?q=Imported", northId)).body.data).toEqual([]);
    expect((await request(token, `/registry/imports/${sessionId}`, southId)).status).toBe(404);
    expect(
        (
            await request(token, `/registry/imports/${sessionId}/commit`, southId, {
                approvedRows: [2, 4],
            })
        ).status,
    ).toBe(404);
    expect(
        (
            await request(token, `/registry/imports/${sessionId}/commit`, northId, {
                approvedRows: [2, 3],
            })
        ).status,
    ).toBe(400);
    expect(
        (
            await request(token, "/registry/imports/preview", northId, {
                sessionId,
                kind: "party",
                csv: csv + "\r\n",
            })
        ).status,
    ).toBe(409);
    const retryPreview = await request(token, "/registry/imports/preview", northId, {
        sessionId,
        kind: "party",
        csv,
    });
    expect(retryPreview.status).toBe(201);

    const committed = await request(token, `/registry/imports/${sessionId}/commit`, northId, {
        approvedRows: [2, 4],
    });
    expect(committed.status).toBe(200);
    expect(committed.body.status).toBe("completed");
    expect((committed.body.summary as Record<string, number>).committed).toBe(2);
    expect((committed.body.summary as Record<string, number>).rejected).toBe(1);
    const committedIds = (committed.body.rows as Array<{ resourceId: string | null }>).map(
        (row) => row.resourceId,
    );
    expect(committedIds[0]).toBeTruthy();
    expect(committedIds[2]).toBeTruthy();
    const repeated = await request(token, `/registry/imports/${sessionId}/commit`, northId, {
        approvedRows: [4, 2],
    });
    expect(repeated.status).toBe(200);
    expect(
        (repeated.body.rows as Array<{ resourceId: string | null }>).map((row) => row.resourceId),
    ).toEqual(committedIds);
    expect(
        (
            await request(token, `/registry/imports/${sessionId}/commit`, northId, {
                approvedRows: [2],
            })
        ).status,
    ).toBe(409);
    expect(
        (await request(token, "/parties?q=Imported", northId)).body.data as unknown[],
    ).toHaveLength(2);

    const errors = await fetch(`${api}/registry/imports/${sessionId}/errors.csv`, {
        headers: { authorization: `Bearer ${token}`, "x-ardenfold-organization-id": northId },
    });
    expect(errors.status).toBe(200);
    expect(await errors.text()).toContain("INVALID_KIND");
    const forbiddenErrors = await fetch(`${api}/registry/imports/${sessionId}/errors.csv`, {
        headers: { authorization: `Bearer ${token}`, "x-ardenfold-organization-id": southId },
    });
    expect(forbiddenErrors.status).toBe(404);
});

test("asset import records business history and rejects malformed or oversized files", async () => {
    const token = await ownerToken();
    const org = await request(token, "/organizations", undefined, {
        name: "Asset Import",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(org.status).toBe(201);
    const organizationId = org.body.id as string;
    const sessionId = randomUUID();
    const csv =
        [
            "template_version,display_name,description,manufacturer,model,classification,lifecycle,identifier_type,identifier_value",
            "1,Imported Meter,,Acme,M100,Electrical,registered,serial,SN-IMP-1",
            "1,Broken Meter,,,,,unknown,serial,SN-IMP-2",
        ].join("\n") + "\n";
    const preview = await request(token, "/registry/imports/preview", organizationId, {
        sessionId,
        kind: "asset",
        csv,
    });
    expect(preview.status).toBe(201);
    expect((preview.body.summary as Record<string, number>).valid).toBe(1);
    const committed = await request(
        token,
        `/registry/imports/${sessionId}/commit`,
        organizationId,
        { approvedRows: [2] },
    );
    expect(committed.status).toBe(200);
    const assetId = (committed.body.rows as Array<{ resourceId: string | null }>)[0]!.resourceId;
    expect(assetId).toBeTruthy();
    const history = await request(token, `/assets/${assetId}/history`, organizationId);
    expect(history.status).toBe(200);
    expect((history.body.data as Array<{ event: string }>).map((entry) => entry.event)).toContain(
        "asset_created",
    );
    const oversized = await request(token, "/registry/imports/preview", organizationId, {
        sessionId: randomUUID(),
        kind: "asset",
        csv: "x".repeat(524_289),
    });
    expect(oversized.status).toBe(400);
    const tooMany = await request(token, "/registry/imports/preview", organizationId, {
        sessionId: randomUUID(),
        kind: "asset",
        csv: csv.split("\n")[0] + "\n" + (csv.split("\n")[1]! + "\n").repeat(501),
    });
    expect(tooMany.status).toBe(400);
});
