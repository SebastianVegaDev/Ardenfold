import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { type NextRequest, NextResponse } from "next/server";

import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";

export async function GET(request: NextRequest) {
    const requestedLocale = request.nextUrl.searchParams.get("locale");
    const locale = isLocale(requestedLocale) ? requestedLocale : getTechnicalFallbackLocale();
    const url = await getSignInUrl({ returnTo: `/${locale}/app` });

    return NextResponse.redirect(url);
}
