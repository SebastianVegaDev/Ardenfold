import { identifierSchema } from "@ardenfold/contracts";
import { type NextRequest, NextResponse } from "next/server";

import { mutateAsset, AssetApiError } from "@/assets/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";

function value(form: FormData, name: string): string {
    const result = form.get(name);
    return typeof result === "string" ? result.trim() : "";
}

function optional(form: FormData, name: string): string | null {
    return value(form, name) || null;
}

function resourceId(form: FormData, name: string): string {
    const parsed = identifierSchema.safeParse(form.get(name));
    if (!parsed.success) throw new Error(`Invalid ${name}.`);
    return parsed.data;
}

function version(form: FormData): number {
    const parsed = Number(value(form, "expectedVersion"));
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Invalid asset version.");
    return parsed;
}

function relationshipTarget(form: FormData) {
    return {
        subject: value(form, "subject"),
        ...(optional(form, "partyId") ? { partyId: resourceId(form, "partyId") } : {}),
        ...(optional(form, "siteId") ? { siteId: resourceId(form, "siteId") } : {}),
        ...(optional(form, "partyAddressId")
            ? { partyAddressId: resourceId(form, "partyAddressId") }
            : {}),
        ...(optional(form, "locationDescription")
            ? { locationDescription: value(form, "locationDescription") }
            : {}),
    };
}

export async function POST(request: NextRequest) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return new Response(null, { status: 403 });

    const form = await request.formData();
    const candidateLocale = form.get("locale");
    const locale =
        typeof candidateLocale === "string" && isLocale(candidateLocale)
            ? candidateLocale
            : getTechnicalFallbackLocale();
    const candidateAssetId = identifierSchema.safeParse(form.get("assetId"));
    const assetId = candidateAssetId.success ? candidateAssetId.data : undefined;
    const base = `/${locale}/app/assets`;
    let target = assetId ? `${base}/${assetId}` : base;

    try {
        const { session, organization } = await getActiveOrganizationSession();
        const context = { token: session.accessToken, organizationId: organization.id };
        const intent = value(form, "intent");
        const expectedVersion = intent === "create" ? undefined : version(form);
        const execute = (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown) =>
            mutateAsset(context.token, context.organizationId, path, method, body);

        if (intent === "create") {
            const initialType = value(form, "identifierType");
            const initialValue = value(form, "identifierValue");
            if (Boolean(initialType) !== Boolean(initialValue))
                throw new Error("Initial identifier is incomplete.");
            const result = await execute("/assets", "POST", {
                displayName: value(form, "displayName"),
                description: optional(form, "description"),
                manufacturer: optional(form, "manufacturer"),
                model: optional(form, "model"),
                classification: optional(form, "classification"),
                identifiers: initialType
                    ? [{ type: initialType, originalValue: initialValue }]
                    : [],
            });
            if (!("id" in result)) throw new Error("Asset creation returned no asset.");
            target = `${base}/${result.id}`;
        } else {
            if (!assetId || !expectedVersion) throw new Error("Invalid asset operation.");
            const path = `/assets/${assetId}`;
            const expected = { expectedVersion };
            switch (intent) {
                case "update":
                    await execute(path, "PATCH", {
                        ...expected,
                        displayName: value(form, "displayName"),
                        description: optional(form, "description"),
                        manufacturer: optional(form, "manufacturer"),
                        model: optional(form, "model"),
                        classification: optional(form, "classification"),
                    });
                    break;
                case "lifecycle":
                    await execute(`${path}/lifecycle`, "POST", {
                        ...expected,
                        lifecycle: value(form, "lifecycle"),
                    });
                    break;
                case "archive":
                case "restore":
                    await execute(`${path}/${intent}`, "POST", expected);
                    break;
                case "add-identifier":
                    await execute(`${path}/identifiers`, "POST", {
                        ...expected,
                        type: value(form, "type"),
                        originalValue: value(form, "originalValue"),
                    });
                    break;
                case "change-identifier":
                    await execute(
                        `${path}/identifiers/${resourceId(form, "identifierId")}`,
                        "PATCH",
                        {
                            ...expected,
                            type: value(form, "type"),
                            originalValue: value(form, "originalValue"),
                        },
                    );
                    break;
                case "retire-identifier":
                    await execute(
                        `${path}/identifiers/${resourceId(form, "identifierId")}`,
                        "DELETE",
                        expected,
                    );
                    break;
                case "start-relationship":
                case "correct-relationship":
                    await execute(
                        `${path}/relationships/${intent === "start-relationship" ? "start" : "correct"}`,
                        "POST",
                        {
                            ...expected,
                            kind: value(form, "kind"),
                            effectiveAt: value(form, "effectiveAt"),
                            ...relationshipTarget(form),
                            ...(intent === "correct-relationship"
                                ? { reason: value(form, "reason") }
                                : {}),
                        },
                    );
                    break;
                case "end-relationship":
                    await execute(`${path}/relationships/end`, "POST", {
                        ...expected,
                        kind: value(form, "kind"),
                        effectiveAt: value(form, "effectiveAt"),
                    });
                    break;
                default:
                    throw new Error("Unknown asset operation.");
            }
        }
        return NextResponse.redirect(new URL(`${target}?notice=success`, request.url), 303);
    } catch (error) {
        const notice =
            error instanceof AssetApiError && error.status === 409
                ? "conflict"
                : error instanceof AssetApiError && error.status === 403
                  ? "forbidden"
                  : "error";
        return NextResponse.redirect(new URL(`${target}?notice=${notice}`, request.url), 303);
    }
}
