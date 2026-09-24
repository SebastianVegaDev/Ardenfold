/* eslint-disable @next/next/no-html-link-for-pages -- Registry import CSV links target download route handlers, not Next.js pages. */

import { randomUUID } from "node:crypto";

import { identifierSchema } from "@ardenfold/contracts";
import { Button, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";
import { getImport, ImportApiError } from "@/features/registry-imports/api-client";
import enMessages from "@/i18n/messages/en.json";
import esMessages from "@/i18n/messages/es.json";

type Props = Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ sessionId?: string; notice?: string }>;
}>;

export default async function RegistryImportsPage({ params, searchParams }: Props) {
    const [{ locale }, query, t, context] = await Promise.all([
        params,
        searchParams,
        getTranslations("imports"),
        getActiveOrganizationSession(),
    ]);
    const active = await getActiveOrganization(
        context.session.accessToken,
        context.organization.id,
    );
    const canImportParty = active.permissions.includes("parties.write");
    const canImportAsset = active.permissions.includes("assets.write");
    if (!canImportParty && !canImportAsset) {
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {t("forbidden")}
                </p>
            </div>
        );
    }
    const parsedSessionId = identifierSchema.safeParse(query.sessionId);
    let session: Awaited<ReturnType<typeof getImport>> | undefined;
    let loadError = false;
    if (query.sessionId) {
        if (!parsedSessionId.success) loadError = true;
        else {
            try {
                session = await getImport(
                    context.session.accessToken,
                    context.organization.id,
                    parsedSessionId.data,
                );
            } catch (error) {
                loadError = true;
                if (error instanceof ImportApiError && error.status === 403) {
                    return (
                        <div className="mx-auto max-w-6xl p-6 sm:p-8">
                            <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                            <p role="alert" className="mt-4">
                                {t("forbidden")}
                            </p>
                        </div>
                    );
                }
            }
        }
    }
    const importMessages = locale === "es" ? esMessages.imports : enMessages.imports;
    const issueLabels: Record<string, string> = importMessages.issues;
    const fieldLabels: Record<string, string> = importMessages.fields;
    const notice =
        query.notice === "success"
            ? t("success")
            : query.notice === "conflict"
              ? t("conflict")
              : query.notice === "forbidden"
                ? t("forbidden")
                : query.notice
                  ? t("error")
                  : null;
    const validRows = session?.rows.filter((row) => row.status === "valid") ?? [];
    const hasErrors = session?.rows.some((row) => row.errors.length) ?? false;
    const nextSessionId = randomUUID();

    return (
        <div className="mx-auto max-w-6xl space-y-8 p-6 sm:p-8">
            <header>
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p className="mt-2 text-muted-foreground">{t("description")}</p>
                {notice ? (
                    <p
                        role={query.notice === "success" ? "status" : "alert"}
                        className="mt-4 rounded-control border border-border p-3 text-sm"
                    >
                        {notice}
                    </p>
                ) : null}
                {loadError ? (
                    <p role="alert" className="mt-4 text-sm">
                        {t("loadError")}
                    </p>
                ) : null}
            </header>

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="import-upload-heading"
            >
                <h2 id="import-upload-heading" className="font-display text-xl font-semibold">
                    {t("upload.title")}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("upload.hint")}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    {canImportParty ? (
                        <a
                            className="text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                            href="/auth/registry-imports?kind=party"
                        >
                            {t("upload.partyTemplate")}
                        </a>
                    ) : null}
                    {canImportAsset ? (
                        <a
                            className="text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                            href="/auth/registry-imports?kind=asset"
                        >
                            {t("upload.assetTemplate")}
                        </a>
                    ) : null}
                </div>
                <form
                    action="/auth/registry-imports"
                    method="post"
                    encType="multipart/form-data"
                    className="mt-5 grid gap-4 sm:grid-cols-2"
                >
                    <input type="hidden" name="intent" value="preview" />
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="sessionId" value={nextSessionId} />
                    <div>
                        <Label htmlFor="import-kind">{t("upload.kind")}</Label>
                        <select
                            id="import-kind"
                            name="kind"
                            defaultValue={canImportParty ? "party" : "asset"}
                            className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                        >
                            {canImportParty ? (
                                <option value="party">{t("kinds.party")}</option>
                            ) : null}
                            {canImportAsset ? (
                                <option value="asset">{t("kinds.asset")}</option>
                            ) : null}
                        </select>
                    </div>
                    <div>
                        <Label htmlFor="import-file">{t("upload.file")}</Label>
                        <input
                            id="import-file"
                            name="file"
                            type="file"
                            accept=".csv,text/csv"
                            required
                            className="mt-2 block w-full rounded-control border border-border p-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                        />
                    </div>
                    <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
                        {t("upload.preview")}
                    </Button>
                </form>
            </section>

            {session ? (
                <section
                    className="rounded-card border border-border bg-surface p-5 sm:p-6"
                    aria-labelledby="import-preview-heading"
                >
                    <h2 id="import-preview-heading" className="font-display text-xl font-semibold">
                        {t("preview.title")}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t(`kinds.${session.kind}`)} · {t(`statuses.${session.status}`)} ·{" "}
                        {t("preview.total", { count: session.totalRows })}
                    </p>
                    <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
                        {(["valid", "rejected", "committed", "failed", "skipped"] as const).map(
                            (status) => (
                                <div key={status}>
                                    <dt className="text-muted-foreground">
                                        {t(`rowStatuses.${status}`)}
                                    </dt>
                                    <dd className="font-semibold">{session.summary[status]}</dd>
                                </div>
                            ),
                        )}
                    </dl>
                    {session.rows.length ? (
                        <div className="mt-5 overflow-x-auto">
                            <table className="w-full min-w-[40rem] text-left text-sm">
                                <caption className="sr-only">{t("preview.tableCaption")}</caption>
                                <thead>
                                    <tr className="border-b border-border">
                                        <th scope="col" className="p-2">
                                            {t("preview.row")}
                                        </th>
                                        <th scope="col" className="p-2">
                                            {t("preview.name")}
                                        </th>
                                        <th scope="col" className="p-2">
                                            {t("preview.status")}
                                        </th>
                                        <th scope="col" className="p-2">
                                            {t("preview.notes")}
                                        </th>
                                        <th scope="col" className="p-2">
                                            {t("preview.result")}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {session.rows.map((row) => (
                                        <tr
                                            key={row.rowNumber}
                                            className="border-b border-border align-top"
                                        >
                                            <td className="p-2">{row.rowNumber}</td>
                                            <td className="p-2">{row.displayName ?? "—"}</td>
                                            <td className="p-2">
                                                {t(`rowStatuses.${row.status}`)}
                                            </td>
                                            <td className="p-2">
                                                <ul className="space-y-1">
                                                    {[...row.errors, ...row.warnings].map(
                                                        (issue, index) => (
                                                            <li key={`${issue.code}-${index}`}>
                                                                {issueLabels[issue.code] ??
                                                                    issue.code}
                                                                {issue.field
                                                                    ? ` (${fieldLabels[issue.field] ?? issue.field})`
                                                                    : ""}
                                                            </li>
                                                        ),
                                                    )}
                                                    {row.duplicateCandidates.map((candidate) => (
                                                        <li key={candidate.id}>
                                                            <Link
                                                                className="text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                                                                href={`/${locale}/app/${session.kind === "party" ? "parties" : "assets"}/${candidate.id}`}
                                                            >
                                                                {t("preview.possibleDuplicate")}:{" "}
                                                                {candidate.displayName}
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </td>
                                            <td className="p-2">
                                                {row.resourceId ? (
                                                    <Link
                                                        className="text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                                                        href={`/${locale}/app/${session.kind === "party" ? "parties" : "assets"}/${row.resourceId}`}
                                                    >
                                                        {t("preview.viewRecord")}
                                                    </Link>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="mt-4 text-sm text-muted-foreground">{t("preview.empty")}</p>
                    )}
                    {hasErrors ? (
                        <a
                            className="mt-4 inline-flex text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                            href={`/auth/registry-imports?sessionId=${session.id}`}
                        >
                            {t("preview.downloadErrors")}
                        </a>
                    ) : null}
                    {session.status === "previewed" ? (
                        <form
                            action="/auth/registry-imports"
                            method="post"
                            className="mt-6 space-y-4 border-t border-border pt-5"
                        >
                            <input type="hidden" name="intent" value="commit" />
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="sessionId" value={session.id} />
                            <fieldset>
                                <legend className="font-medium">{t("preview.approve")}</legend>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {validRows.map((row) => (
                                        <label
                                            key={row.rowNumber}
                                            className="flex items-center gap-2"
                                        >
                                            <input
                                                type="checkbox"
                                                name="approvedRows"
                                                value={row.rowNumber}
                                                defaultChecked
                                            />
                                            <span>
                                                {t("preview.row")} {row.rowNumber}:{" "}
                                                {row.displayName}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                            <label className="flex items-start gap-2 text-sm">
                                <input type="checkbox" name="confirmed" value="yes" required />
                                <span>{t("preview.confirm")}</span>
                            </label>
                            <Button type="submit">{t("preview.commit")}</Button>
                        </form>
                    ) : null}
                    {session.status === "committing" ? (
                        <Link
                            className="mt-4 inline-flex text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                            href={`/${locale}/app/imports?sessionId=${session.id}`}
                        >
                            {t("preview.refresh")}
                        </Link>
                    ) : null}
                </section>
            ) : null}
        </div>
    );
}
