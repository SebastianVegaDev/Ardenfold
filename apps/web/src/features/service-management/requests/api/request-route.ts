import "server-only";

import {
    createServiceRequestSchema,
    identifierSchema,
    transitionServiceRequestSchema,
    updateServiceRequestSchema,
} from "@ardenfold/contracts";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getActiveOrganizationSession } from "@/auth/server-organization";

import {
    findAssets,
    findCustomers,
    getCustomer,
    getKnownAsset,
    getServiceRequest,
    mutateServiceRequest,
    ServiceRequestApiError,
} from "./request-api";

const mutationSchema = z.discriminatedUnion("intent", [
    z.strictObject({ intent: z.literal("create"), payload: createServiceRequestSchema }),
    z.strictObject({
        intent: z.literal("update"),
        requestId: identifierSchema,
        payload: updateServiceRequestSchema,
    }),
    z.strictObject({
        intent: z.enum(["cancel", "close"]),
        requestId: identifierSchema,
        payload: transitionServiceRequestSchema,
    }),
]);

function rejected(error: unknown): NextResponse {
    if (error instanceof ServiceRequestApiError) {
        return NextResponse.json(
            { error: { code: error.code } },
            { status: error.status, headers: { "cache-control": "no-store" } },
        );
    }
    return NextResponse.json(
        { error: { code: "REQUEST_REJECTED" } },
        { status: 500, headers: { "cache-control": "no-store" } },
    );
}

export async function requestLookup(request: NextRequest): Promise<NextResponse> {
    const kind = request.nextUrl.searchParams.get("kind");
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const id = request.nextUrl.searchParams.get("id");
    if (
        (query && (query.length < 2 || query.length > 100)) ||
        (id && !identifierSchema.safeParse(id).success)
    ) {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    if (!["customers", "customer", "assets", "asset", "request"].includes(kind ?? "")) {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    if (["customer", "asset", "request"].includes(kind!) && !id) {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    const { session, organization } = await getActiveOrganizationSession();
    try {
        const token = session.accessToken;
        const orgId = organization.id;
        const result =
            kind === "customers"
                ? await findCustomers(token, orgId, query)
                : kind === "customer"
                  ? await getCustomer(token, orgId, id!)
                  : kind === "assets"
                    ? await findAssets(token, orgId, query)
                    : kind === "asset"
                      ? await getKnownAsset(token, orgId, id!)
                      : await getServiceRequest(token, orgId, id!);
        return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    } catch (error) {
        return rejected(error);
    }
}

export async function requestMutation(request: NextRequest): Promise<NextResponse> {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
        return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    let value: unknown;
    try {
        const raw = await request.text();
        if (raw.length > 2_200_000) {
            return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
        }
        value = JSON.parse(raw);
    } catch {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    const parsed = mutationSchema.safeParse(value);
    if (!parsed.success) {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    const { session, organization } = await getActiveOrganizationSession();
    try {
        const { intent, payload } = parsed.data;
        const path =
            intent === "create"
                ? "/service-requests"
                : intent === "update"
                  ? `/service-requests/${parsed.data.requestId}`
                  : `/service-requests/${parsed.data.requestId}/${intent}`;
        const detail = await mutateServiceRequest(
            session.accessToken,
            organization.id,
            path,
            intent === "update" ? "PATCH" : "POST",
            payload,
        );
        return NextResponse.json(detail, { headers: { "cache-control": "no-store" } });
    } catch (error) {
        return rejected(error);
    }
}
