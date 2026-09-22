import { identifierSchema, organizationRoleSchema } from "@ardenfold/contracts";
import { type NextRequest, NextResponse } from "next/server";

import { mutateOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";

export async function POST(request: NextRequest) {
    const form = await request.formData();
    const formLocale = form.get("locale");
    const locale = typeof formLocale === "string" && isLocale(formLocale) ? formLocale : getTechnicalFallbackLocale();
    const intent = form.get("intent");

    try {
        const { session, organization } = await getActiveOrganizationSession();
        const id = identifierSchema.safeParse(form.get("id"));

        switch (intent) {
            case "update-profile":
                await mutateOrganization(session.accessToken, organization.id, "/api/v1/organizations/current", "PATCH", {
                    name: form.get("name"),
                    defaultLocale: form.get("defaultLocale"),
                    defaultTimeZone: form.get("defaultTimeZone"),
                });
                break;
            case "create-site":
                await mutateOrganization(session.accessToken, organization.id, "/api/v1/organizations/current/sites", "POST", {
                    name: form.get("name"),
                    code: form.get("code") || null,
                    timeZone: form.get("timeZone") || null,
                });
                break;
            case "create-invitation": {
                const role = organizationRoleSchema.safeParse(form.get("role"));
                if (!role.success) throw new Error("Invalid role.");
                const created = await mutateOrganization(session.accessToken, organization.id, "/api/v1/organizations/current/invitations", "POST", {
                    email: form.get("email"),
                    role: role.data,
                });
                return NextResponse.json(created, {
                    headers: { "cache-control": "no-store" },
                });
            }
            case "cancel-invitation":
                if (!id.success) throw new Error("Invalid invitation.");
                await mutateOrganization(session.accessToken, organization.id, `/api/v1/organizations/current/invitations/${id.data}`, "DELETE");
                break;
            case "update-role": {
                const role = organizationRoleSchema.safeParse(form.get("role"));
                if (!id.success || !role.success) throw new Error("Invalid membership change.");
                await mutateOrganization(session.accessToken, organization.id, `/api/v1/organizations/current/members/${id.data}/role`, "PATCH", { role: role.data });
                break;
            }
            case "suspend-member":
                if (!id.success) throw new Error("Invalid membership.");
                await mutateOrganization(session.accessToken, organization.id, `/api/v1/organizations/current/members/${id.data}/suspend`, "POST");
                break;
            case "remove-member":
                if (!id.success) throw new Error("Invalid membership.");
                await mutateOrganization(session.accessToken, organization.id, `/api/v1/organizations/current/members/${id.data}`, "DELETE");
                break;
            default:
                throw new Error("Unknown organization operation.");
        }

        return NextResponse.redirect(new URL(`/${locale}/app/settings/organization?status=success`, request.url), 303);
    } catch {
        return NextResponse.redirect(new URL(`/${locale}/app/settings/organization?status=error`, request.url), 303);
    }
}
