import { signOut } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";

import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";

export async function POST(request: NextRequest) {
    const requestedLocale = request.nextUrl.searchParams.get("locale");
    const locale = isLocale(requestedLocale) ? requestedLocale : getTechnicalFallbackLocale();

    await signOut({ returnTo: new URL(`/${locale}`, request.url).toString() });
}
