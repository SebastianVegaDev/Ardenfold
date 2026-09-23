import { identifierSchema } from "@ardenfold/contracts";
import { type NextRequest, NextResponse } from "next/server";

import { getActiveOrganizationSession } from "@/auth/server-organization";
import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";
import { mutateParty, PartyApiError } from "@/parties/api-client";

function stringValue(form: FormData, name: string): string {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
}

function optionalValue(form: FormData, name: string): string | null {
    return stringValue(form, name).trim() || null;
}

function idValue(form: FormData, name: string): string {
    const parsed = identifierSchema.safeParse(form.get(name));
    if (!parsed.success) throw new Error("Invalid party resource reference.");
    return parsed.data;
}

function expectedVersion(form: FormData): number {
    const value = Number(stringValue(form, "expectedVersion"));
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid party version.");
    return value;
}

export async function POST(request: NextRequest) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
        return new Response(null, { status: 403 });
    }
    const form = await request.formData();
    const candidateLocale = form.get("locale");
    const locale =
        typeof candidateLocale === "string" && isLocale(candidateLocale)
            ? candidateLocale
            : getTechnicalFallbackLocale();
    const candidatePartyId = identifierSchema.safeParse(form.get("partyId"));
    const partyId = candidatePartyId.success ? candidatePartyId.data : undefined;
    const base = `/${locale}/app/parties`;
    let target = partyId ? `${base}/${partyId}` : base;

    try {
        const { session, organization } = await getActiveOrganizationSession();
        const intent = stringValue(form, "intent");
        const roles = form
            .getAll("roles")
            .filter((value): value is string => typeof value === "string");
        const version = intent === "create" ? undefined : expectedVersion(form);
        const context = { token: session.accessToken, organizationId: organization.id };
        const execute = (
            path: string,
            method: "POST" | "PATCH" | "PUT" | "DELETE",
            body: unknown,
        ) => mutateParty(context.token, context.organizationId, path, method, body);

        if (intent === "create") {
            const created = await execute("/parties", "POST", {
                kind: stringValue(form, "kind"),
                displayName: stringValue(form, "displayName"),
                legalName: optionalValue(form, "legalName"),
                roles,
            });
            target = `${base}/${created.id}`;
        } else {
            if (!partyId || !version) throw new Error("Invalid party operation.");
            const path = `/parties/${partyId}`;
            const expected = { expectedVersion: version };

            switch (intent) {
                case "update":
                    await execute(path, "PATCH", {
                        ...expected,
                        displayName: stringValue(form, "displayName"),
                        legalName: optionalValue(form, "legalName"),
                    });
                    break;
                case "roles":
                    await execute(`${path}/roles`, "PUT", { ...expected, roles });
                    break;
                case "archive":
                case "restore":
                    await execute(`${path}/${intent}`, "POST", expected);
                    break;
                case "add-identifier":
                    await execute(`${path}/identifiers`, "POST", {
                        ...expected,
                        type: stringValue(form, "type"),
                        originalValue: stringValue(form, "originalValue"),
                    });
                    break;
                case "remove-identifier":
                    await execute(
                        `${path}/identifiers/${idValue(form, "identifierId")}`,
                        "DELETE",
                        expected,
                    );
                    break;
                case "add-contact":
                    await execute(`${path}/contacts`, "POST", {
                        ...expected,
                        displayName: stringValue(form, "displayName"),
                        jobTitle: optionalValue(form, "jobTitle"),
                        isPrimary: form.get("isPrimary") === "on",
                    });
                    break;
                case "update-contact":
                    await execute(`${path}/contacts/${idValue(form, "contactId")}`, "PATCH", {
                        ...expected,
                        displayName: stringValue(form, "displayName"),
                        jobTitle: optionalValue(form, "jobTitle"),
                        isPrimary: form.get("isPrimary") === "on",
                    });
                    break;
                case "remove-contact":
                    await execute(
                        `${path}/contacts/${idValue(form, "contactId")}`,
                        "DELETE",
                        expected,
                    );
                    break;
                case "add-channel":
                    await execute(
                        `${path}/contacts/${idValue(form, "contactId")}/channels`,
                        "POST",
                        {
                            ...expected,
                            type: stringValue(form, "type"),
                            label: optionalValue(form, "label"),
                            value: stringValue(form, "value"),
                        },
                    );
                    break;
                case "update-channel":
                    await execute(
                        `${path}/contacts/${idValue(form, "contactId")}/channels/${idValue(form, "channelId")}`,
                        "PATCH",
                        {
                            ...expected,
                            type: stringValue(form, "type"),
                            label: optionalValue(form, "label"),
                            value: stringValue(form, "value"),
                        },
                    );
                    break;
                case "remove-channel":
                    await execute(
                        `${path}/contacts/${idValue(form, "contactId")}/channels/${idValue(form, "channelId")}`,
                        "DELETE",
                        expected,
                    );
                    break;
                case "add-address":
                case "update-address": {
                    const body = {
                        ...expected,
                        label: stringValue(form, "label"),
                        line1: stringValue(form, "line1"),
                        line2: optionalValue(form, "line2"),
                        locality: stringValue(form, "locality"),
                        region: optionalValue(form, "region"),
                        postalCode: optionalValue(form, "postalCode"),
                        countryCode: stringValue(form, "countryCode"),
                    };
                    await execute(
                        intent === "add-address"
                            ? `${path}/addresses`
                            : `${path}/addresses/${idValue(form, "addressId")}`,
                        intent === "add-address" ? "POST" : "PATCH",
                        body,
                    );
                    break;
                }
                case "remove-address":
                    await execute(
                        `${path}/addresses/${idValue(form, "addressId")}`,
                        "DELETE",
                        expected,
                    );
                    break;
                default:
                    throw new Error("Unknown party operation.");
            }
        }
        return NextResponse.redirect(new URL(`${target}?notice=success`, request.url), 303);
    } catch (error) {
        const status =
            error instanceof PartyApiError && error.status === 409
                ? "conflict"
                : error instanceof PartyApiError && error.status === 403
                  ? "forbidden"
                  : "error";
        return NextResponse.redirect(new URL(`${target}?notice=${status}`, request.url), 303);
    }
}
