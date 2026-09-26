import "server-only";

import {
    createWorkOrderSchema,
    identifierSchema,
    restructureWorkItemSchema,
    updateWorkItemSchema,
    updateWorkOrderSchema,
    workItemTransitionSchema,
    workOrderTransitionSchema,
} from "@ardenfold/contracts";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getActiveOrganizationSession } from "@/auth/server-organization";
import {
    AssetApiError,
    getAsset,
    getCurrentRelationships,
    listAssets,
} from "@/features/assets/api-client";

import { getWorkOrder, mutateWorkOrder, WorkOrderApiError } from "./work-order-api";

const mutationSchema = z.discriminatedUnion("intent", [
    z.strictObject({ intent: z.literal("create"), payload: createWorkOrderSchema }),
    z.strictObject({
        intent: z.literal("update"),
        orderId: identifierSchema,
        payload: updateWorkOrderSchema,
    }),
    z.strictObject({
        intent: z.enum(["ready", "planned", "cancel"]),
        orderId: identifierSchema,
        payload: workOrderTransitionSchema,
    }),
    z.strictObject({
        intent: z.literal("updateItem"),
        orderId: identifierSchema,
        itemId: identifierSchema,
        payload: updateWorkItemSchema,
    }),
    z.strictObject({
        intent: z.literal("restructureItem"),
        orderId: identifierSchema,
        itemId: identifierSchema,
        payload: restructureWorkItemSchema,
    }),
    z.strictObject({
        intent: z.enum(["readyItem", "plannedItem", "cancelItem"]),
        orderId: identifierSchema,
        itemId: identifierSchema,
        payload: workItemTransitionSchema,
    }),
]);

function rejected(error: unknown): NextResponse {
    return NextResponse.json(
        {
            error: {
                code: error instanceof WorkOrderApiError ? error.code : "WORK_ORDER_REJECTED",
            },
        },
        {
            status:
                error instanceof WorkOrderApiError || error instanceof AssetApiError
                    ? error.status
                    : 500,
            headers: { "cache-control": "no-store" },
        },
    );
}

export async function workOrderLookup(request: NextRequest): Promise<NextResponse> {
    const kind = request.nextUrl.searchParams.get("kind") ?? "order";
    const id = request.nextUrl.searchParams.get("id");
    const query = request.nextUrl.searchParams.get("q") ?? "";
    if (
        (kind !== "assets" && (!id || !identifierSchema.safeParse(id).success)) ||
        (kind === "assets" &&
            (query.length > 100 || (query.length > 0 && query.trim().length < 2))) ||
        !["order", "assets", "asset", "relationships"].includes(kind)
    )
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    const { session, organization } = await getActiveOrganizationSession();
    try {
        const result =
            kind === "assets"
                ? await listAssets(
                      session.accessToken,
                      organization.id,
                      new URLSearchParams({
                          status: "active",
                          limit: "25",
                          ...(query ? { q: query } : {}),
                      }),
                  )
                : kind === "asset"
                  ? await getAsset(session.accessToken, organization.id, id!)
                  : kind === "relationships"
                    ? await getCurrentRelationships(session.accessToken, organization.id, id!)
                    : await getWorkOrder(session.accessToken, organization.id, id!);
        return NextResponse.json(result, {
            headers: { "cache-control": "no-store" },
        });
    } catch (error) {
        return rejected(error);
    }
}

export async function workOrderMutation(request: NextRequest): Promise<NextResponse> {
    if (request.headers.get("origin") !== request.nextUrl.origin)
        return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    let value: unknown;
    try {
        const raw = await request.text();
        if (raw.length > 2_200_000) throw new Error("Payload too large");
        value = JSON.parse(raw);
    } catch {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    }
    const parsed = mutationSchema.safeParse(value);
    if (!parsed.success)
        return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
    const action = parsed.data;
    const { session, organization } = await getActiveOrganizationSession();
    try {
        const base = action.intent === "create" ? "/work-orders" : `/work-orders/${action.orderId}`;
        const itemPath = "itemId" in action ? `${base}/items/${action.itemId}` : null;
        const path =
            action.intent === "create" || action.intent === "update"
                ? base
                : action.intent === "updateItem"
                  ? itemPath!
                  : action.intent === "restructureItem"
                    ? `${itemPath}/restructure`
                    : action.intent.endsWith("Item")
                      ? `${itemPath}/${action.intent.replace("Item", "").toLowerCase()}`
                      : `${base}/${action.intent}`;
        const method =
            action.intent === "update" || action.intent === "updateItem" ? "PATCH" : "POST";
        const result = await mutateWorkOrder(
            session.accessToken,
            organization.id,
            path,
            method,
            action.payload,
        );
        return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    } catch (error) {
        return rejected(error);
    }
}
