import type { NextRequest } from "next/server";

import {
    quoteLookup,
    quoteMutation,
} from "@/features/service-management/quotations/api/quote-route";

export const GET = (request: NextRequest) => quoteLookup(request);
export const POST = (request: NextRequest) => quoteMutation(request);
