import { identifierSchema } from "@ardenfold/contracts";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { getAccessibleOrganizations } from "@/auth/api-client";
import { activeOrganizationCookie } from "@/auth/organization-context";
import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";

export async function POST(request: NextRequest) {
    const session = await withAuth({ ensureSignedIn: true });
    const form = await request.formData();
    const parsedOrganizationId = identifierSchema.safeParse(form.get("organizationId"));
    const requestedLocale = form.get("locale");
    const locale =
        typeof requestedLocale === "string" && isLocale(requestedLocale)
            ? requestedLocale
            : getTechnicalFallbackLocale();

    if (!parsedOrganizationId.success) {
        return NextResponse.redirect(
            new URL(`/${locale}/app?organization=invalid`, request.url),
            303,
        );
    }

    const organizations = await getAccessibleOrganizations(session.accessToken);
    const isAccessible = organizations.data.some(
        (organization) => organization.id === parsedOrganizationId.data,
    );

    if (!isAccessible) {
        return NextResponse.redirect(
            new URL(`/${locale}/app?organization=denied`, request.url),
            303,
        );
    }

    const cookieStore = await cookies();
    cookieStore.set(activeOrganizationCookie, parsedOrganizationId.data, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.redirect(new URL(`/${locale}/app`, request.url), 303);
}
