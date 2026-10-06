import type { NextRequest } from "next/server";

import { technicalRoute } from "@/features/technical-operations/api/technical-route";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
    return technicalRoute(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: Context) {
    return technicalRoute(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: Context) {
    return technicalRoute(request, (await context.params).path);
}

export async function PUT(request: NextRequest, context: Context) {
    return technicalRoute(request, (await context.params).path);
}
