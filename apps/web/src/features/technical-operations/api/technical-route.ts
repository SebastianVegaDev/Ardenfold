import "server-only";

import { identifierSchema } from "@ardenfold/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { getActiveOrganizationSession } from "@/auth/server-organization";
import { getServerEnvironment } from "@/config/environment";

const uuid = "[0-9a-fA-F-]{36}";
const execution = `technical-executions/${uuid}`;
const revision = `${execution}/revisions/${uuid}`;
const routes: Record<string, RegExp[]> = {
    GET: [
        /^technical-operations\/queues$/,
        /^technical-executions$/,
        new RegExp(`^${execution}$`),
        new RegExp(`^${revision}/(?:results|evidence)$`),
        new RegExp(`^${revision}/evidence/${uuid}/content$`),
    ],
    POST: [
        /^technical-executions$/,
        /^files$/,
        new RegExp(`^files/${uuid}/finalize$`),
        new RegExp(`^${execution}/revisions$`),
        new RegExp(`^${revision}/(?:submit|results|result-groups|evidence)$`),
        new RegExp(`^${revision}/(?:results|result-groups)/reorder$`),
        new RegExp(`^${revision}/(?:results|result-groups|evidence)/${uuid}/remove$`),
    ],
    PATCH: [
        new RegExp(`^${revision}$`),
        new RegExp(`^${revision}/(?:results|result-groups|evidence)/${uuid}$`),
    ],
    PUT: [new RegExp(`^files/${uuid}/content$`)],
};

export async function technicalRoute(
    request: NextRequest,
    segments: string[],
): Promise<NextResponse> {
    const path = segments.join("/");
    if (!routes[request.method]?.some((route) => route.test(path)))
        return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    for (const segment of segments) {
        if (segment.length === 36 && !identifierSchema.safeParse(segment).success)
            return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    if (request.method !== "GET" && request.headers.get("origin") !== request.nextUrl.origin)
        return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

    const isUpload = request.method === "PUT";
    const maxLength = isUpload ? 10_485_760 : 2_200_000;
    const body = request.method === "GET" ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > maxLength)
        return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, { status: 413 });
    if (body && !isUpload) {
        try {
            JSON.parse(new TextDecoder().decode(body));
        } catch {
            return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
        }
    }
    const { session, organization } = await getActiveOrganizationSession();
    const url = new URL(`/api/v1/${path}`, getServerEnvironment().ARDENFOLD_API_URL);
    if (request.method === "GET") url.search = request.nextUrl.search;
    try {
        const response = await fetch(url, {
            method: request.method,
            headers: {
                authorization: `Bearer ${session.accessToken}`,
                "x-ardenfold-organization-id": organization.id,
                accept: isUpload ? "application/json" : "*/*",
                ...(body
                    ? { "content-type": isUpload ? "application/octet-stream" : "application/json" }
                    : {}),
            },
            ...(body ? { body: Buffer.from(body) } : {}),
            cache: "no-store",
        });
        const download = path.endsWith("/content") && request.method === "GET";
        const headers = new Headers({ "cache-control": "private, no-store" });
        if (download && response.ok) {
            headers.set("content-type", "application/octet-stream");
            headers.set("x-content-type-options", "nosniff");
            const disposition = response.headers.get("content-disposition");
            if (disposition) headers.set("content-disposition", disposition);
        } else headers.set("content-type", "application/json");
        return new NextResponse(response.body, { status: response.status, headers });
    } catch {
        return NextResponse.json({ error: { code: "TECHNICAL_API_UNAVAILABLE" } }, { status: 502 });
    }
}
