import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";

export const GET = handleAuth({
    onError: ({ request }) => {
        const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
        const locale = isLocale(cookieLocale) ? cookieLocale : getTechnicalFallbackLocale();

        return NextResponse.redirect(new URL(`/${locale}/sign-in?error=callback`, request.url));
    },
});
