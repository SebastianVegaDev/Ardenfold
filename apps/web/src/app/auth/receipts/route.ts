import type { NextRequest } from "next/server";

import {
    receiptLookup,
    receiptMutation,
} from "@/features/service-management/receipts/api/receipt-route";

export const GET = (request: NextRequest) => receiptLookup(request);
export const POST = (request: NextRequest) => receiptMutation(request);
