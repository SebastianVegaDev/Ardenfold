import type { NextRequest } from "next/server";

import {
    workOrderLookup,
    workOrderMutation,
} from "@/features/service-management/work-orders/api/work-order-route";

export const GET = (request: NextRequest) => workOrderLookup(request);
export const POST = (request: NextRequest) => workOrderMutation(request);
