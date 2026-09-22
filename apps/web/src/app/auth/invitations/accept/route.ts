import { withAuth } from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { acceptOrganizationInvitation } from "@/auth/api-client";
import { activeOrganizationCookie } from "@/auth/organization-context";
import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";

export async function POST(request: NextRequest) {
    const session = await withAuth({ ensureSignedIn: true });
    const form = await request.formData();
    const token = form.get("token");
    const formLocale = form.get("locale");
    const locale =
        typeof formLocale === "string" && isLocale(formLocale)
            ? formLocale
            : getTechnicalFallbackLocale();

    if (typeof token !== "string") {
        return NextResponse.redirect(
            new URL(`/${locale}/app/invitations/accept?status=invalid`, request.url),
            303,
        );
    }

    try {
        const result = await acceptOrganizationInvitation(session.accessToken, token);
        const cookieStore = await cookies();
        cookieStore.set(activeOrganizationCookie, result.organizationId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
        });
        return NextResponse.redirect(
            new URL(`/${locale}/app?status=invitation-accepted`, request.url),
            303,
        );
    } catch {
        return NextResponse.redirect(
            new URL(`/${locale}/app/invitations/accept?status=error`, request.url),
            303,
        );
    }
}
