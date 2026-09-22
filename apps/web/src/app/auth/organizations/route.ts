import { createOrganizationRequestSchema } from "@ardenfold/contracts";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { createOrganization } from "@/auth/api-client";
import { activeOrganizationCookie } from "@/auth/organization-context";
import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";

export async function POST(request: NextRequest) {
    const session = await withAuth({ ensureSignedIn: true });
    const form = await request.formData();
    const formLocale = form.get("locale");
    const locale = typeof formLocale === "string" && isLocale(formLocale) ? formLocale : getTechnicalFallbackLocale();
    const parsed = createOrganizationRequestSchema.safeParse({
        name: form.get("name"),
        defaultLocale: form.get("defaultLocale"),
        defaultTimeZone: form.get("defaultTimeZone"),
    });

    if (!parsed.success) {
        return NextResponse.redirect(new URL(`/${locale}/app/onboarding?status=invalid`, request.url), 303);
    }

    try {
        const organization = await createOrganization(session.accessToken, parsed.data);
        const cookieStore = await cookies();
        cookieStore.set(activeOrganizationCookie, organization.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
        });
        return NextResponse.redirect(new URL(`/${locale}/app?status=created`, request.url), 303);
    } catch {
        return NextResponse.redirect(new URL(`/${locale}/app/onboarding?status=error`, request.url), 303);
    }
}
