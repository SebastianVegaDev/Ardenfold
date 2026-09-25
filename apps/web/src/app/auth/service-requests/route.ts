import type { NextRequest } from "next/server";

import {
    requestLookup,
    requestMutation,
} from "@/features/service-management/requests/api/request-route";

export const GET = (request: NextRequest) => requestLookup(request);
export const POST = (request: NextRequest) => requestMutation(request);
