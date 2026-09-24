import { identifierSchema, registryImportKindSchema } from "@ardenfold/contracts";
import { type NextRequest, NextResponse } from "next/server";

import { getActiveOrganizationSession } from "@/auth/server-organization";
import {
    ImportApiError,
    commitImport,
    downloadImportCsv,
    previewImport,
} from "@/imports/api-client";
import { getTechnicalFallbackLocale, isLocale } from "@/i18n/locales";

function value(form: FormData, name: string): string {
    const item = form.get(name);
    return typeof item === "string" ? item.trim() : "";
}

export async function POST(request: NextRequest) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return new Response(null, { status: 403 });
    const form = await request.formData();
    const localeCandidate = value(form, "locale");
    const locale = isLocale(localeCandidate) ? localeCandidate : getTechnicalFallbackLocale();
    const sessionCandidate = identifierSchema.safeParse(form.get("sessionId"));
    const sessionId = sessionCandidate.success ? sessionCandidate.data : null;
    const base = `/${locale}/app/imports`;
    const target = sessionId ? `${base}?sessionId=${sessionId}` : base;

    try {
        if (!sessionId) throw new Error("Invalid import session ID.");
        const { session, organization } = await getActiveOrganizationSession();
        const intent = value(form, "intent");
        if (intent === "preview") {
            const kind = registryImportKindSchema.parse(form.get("kind"));
            const file = form.get("file");
            if (!(file instanceof File) || file.size > 524_288 || file.size === 0)
                throw new Error("Invalid CSV file size.");
            const csv = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
            await previewImport(session.accessToken, organization.id, { sessionId, kind, csv });
        } else if (intent === "commit") {
            if (value(form, "confirmed") !== "yes") throw new Error("Confirmation required.");
            const approvedRows = form.getAll("approvedRows").map(Number);
            if (approvedRows.some((row) => !Number.isSafeInteger(row) || row < 2 || row > 501))
                throw new Error("Invalid approved row.");
            await commitImport(session.accessToken, organization.id, sessionId, approvedRows);
        } else {
            throw new Error("Unknown import action.");
        }
        return NextResponse.redirect(
            new URL(`${target}${target.includes("?") ? "&" : "?"}notice=success`, request.url),
            303,
        );
    } catch (error) {
        const notice =
            error instanceof ImportApiError && error.status === 409
                ? "conflict"
                : error instanceof ImportApiError && error.status === 403
                  ? "forbidden"
                  : "error";
        return NextResponse.redirect(
            new URL(`${target}${target.includes("?") ? "&" : "?"}notice=${notice}`, request.url),
            303,
        );
    }
}

export async function GET(request: NextRequest) {
    const { session, organization } = await getActiveOrganizationSession();
    const kind = registryImportKindSchema.safeParse(request.nextUrl.searchParams.get("kind"));
    const sessionId = identifierSchema.safeParse(request.nextUrl.searchParams.get("sessionId"));
    const path = kind.success
        ? `/templates/${kind.data}`
        : sessionId.success
          ? `/${sessionId.data}/errors.csv`
          : null;
    if (!path) return new Response(null, { status: 400 });
    try {
        const csv = await downloadImportCsv(session.accessToken, organization.id, path);
        const name = kind.success
            ? `ardenfold-${kind.data}-v1.csv`
            : `ardenfold-import-${sessionId.data}-errors.csv`;
        return new Response(csv, {
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": `attachment; filename="${name}"`,
                "cache-control": "no-store",
                "x-content-type-options": "nosniff",
            },
        });
    } catch (error) {
        return new Response(null, { status: error instanceof ImportApiError ? error.status : 500 });
    }
}
