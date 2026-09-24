import { identifierSchema } from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";
import { AddressesSection } from "@/parties/addresses-section";
import { getParty, PartyApiError } from "@/parties/api-client";
import { ContactsSection } from "@/parties/contacts-section";
import { PartyFormFields } from "@/parties/party-form-fields";

type Props = Readonly<{
    params: Promise<{ locale: Locale; partyId: string }>;
    searchParams: Promise<{ notice?: string }>;
}>;

export default async function PartyDetailPage({ params, searchParams }: Props) {
    const [{ locale, partyId }, query, t, context] = await Promise.all([
        params,
        searchParams,
        getTranslations("parties"),
        getActiveOrganizationSession(),
    ]);
    if (!identifierSchema.safeParse(partyId).success) notFound();
    const active = await getActiveOrganization(
        context.session.accessToken,
        context.organization.id,
    );
    if (!active.permissions.includes("parties.read")) {
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {t("forbidden")}
                </p>
            </div>
        );
    }
    let party;
    try {
        party = await getParty(context.session.accessToken, context.organization.id, partyId);
    } catch (error) {
        if (error instanceof PartyApiError && error.status === 404) notFound();
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {error instanceof PartyApiError && error.status === 403
                        ? t("forbidden")
                        : t("loadError")}
                </p>
            </div>
        );
    }
    const canWrite = active.permissions.includes("parties.write") && party.status === "active";
    const canArchive = active.permissions.includes("parties.archive");
    const date = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: active.defaultTimeZone,
    });
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
    const fields = (intent: string) => (
        <PartyFormFields
            locale={locale}
            partyId={party.id}
            version={party.version}
            intent={intent}
        />
    );

    return (
        <div className="mx-auto max-w-6xl space-y-8 p-6 sm:p-8">
            <header>
                <Link
                    className="text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                    href={`/${locale}/app/parties`}
                >
                    {t("back")}
                </Link>
                <h1 className="mt-3 font-display text-3xl font-semibold">{party.displayName}</h1>
                <p className="mt-2 text-muted-foreground">
                    {t(`kinds.${party.kind}`)} ·{" "}
                    {party.roles.map((role) => t(`roles.${role}`)).join(", ")} ·{" "}
                    {t(`statuses.${party.status}`)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                    {t("detail.created")}: {date.format(new Date(party.createdAt))} ·{" "}
                    {t("detail.updated")}: {date.format(new Date(party.updatedAt))}
                </p>
                {notice ? (
                    <p
                        className="mt-4 rounded-control border border-border p-3 text-sm"
                        role={query.notice === "success" ? "status" : "alert"}
                    >
                        {notice}
                    </p>
                ) : null}
                {!canWrite && party.status === "active" ? (
                    <p className="mt-3 text-sm text-muted-foreground">{t("detail.readOnly")}</p>
                ) : null}
            </header>

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="party-profile-title"
            >
                <h2 id="party-profile-title" className="font-display text-xl font-semibold">
                    {t("detail.profile")}
                </h2>
                {canWrite ? (
                    <form
                        action="/auth/party-management"
                        method="post"
                        className="mt-4 grid gap-4 sm:grid-cols-2"
                    >
                        {fields("update")}
                        <div>
                            <Label htmlFor="party-display-name">{t("displayName")}</Label>
                            <Input
                                id="party-display-name"
                                name="displayName"
                                defaultValue={party.displayName}
                                required
                                maxLength={200}
                            />
                        </div>
                        <div>
                            <Label htmlFor="party-legal-name">{t("legalName")}</Label>
                            <Input
                                id="party-legal-name"
                                name="legalName"
                                defaultValue={party.legalName ?? ""}
                                maxLength={200}
                            />
                        </div>
                        <Button className="sm:col-span-2 sm:justify-self-start" type="submit">
                            {t("detail.save")}
                        </Button>
                    </form>
                ) : (
                    <p className="mt-4 text-sm">{party.legalName ?? party.displayName}</p>
                )}
            </section>

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="party-roles-title"
            >
                <h2 id="party-roles-title" className="font-display text-xl font-semibold">
                    {t("detail.roles")}
                </h2>
                {canWrite ? (
                    <form
                        action="/auth/party-management"
                        method="post"
                        className="mt-4 flex flex-wrap items-end gap-4"
                    >
                        {fields("roles")}
                        <label className="flex items-center gap-2">
                            <input
                                name="roles"
                                type="checkbox"
                                value="customer"
                                defaultChecked={party.roles.includes("customer")}
                            />
                            {t("roles.customer")}
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                name="roles"
                                type="checkbox"
                                value="provider"
                                defaultChecked={party.roles.includes("provider")}
                            />
                            {t("roles.provider")}
                        </label>
                        <Button type="submit">{t("detail.saveRoles")}</Button>
                    </form>
                ) : (
                    <p className="mt-3 text-sm">
                        {party.roles.map((role) => t(`roles.${role}`)).join(", ")}
                    </p>
                )}
            </section>

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="party-identifiers-title"
            >
                <h2 id="party-identifiers-title" className="font-display text-xl font-semibold">
                    {t("identifiers.title")}
                </h2>
                {party.identifiers.length ? (
                    <ul className="mt-4 divide-y divide-border">
                        {party.identifiers.map((identifier) => (
                            <li
                                key={identifier.id}
                                className="flex flex-wrap items-center justify-between gap-3 py-3"
                            >
                                <p className="text-sm">
                                    <span className="font-medium">{identifier.type}</span> ·{" "}
                                    {identifier.originalValue}
                                </p>
                                {canWrite ? (
                                    <form action="/auth/party-management" method="post">
                                        {fields("remove-identifier")}
                                        <input
                                            type="hidden"
                                            name="identifierId"
                                            value={identifier.id}
                                        />
                                        <Button size="sm" variant="outline" type="submit">
                                            {t("identifiers.remove")}
                                        </Button>
                                    </form>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-3 text-sm text-muted-foreground">{t("identifiers.empty")}</p>
                )}
                {canWrite ? (
                    <form
                        action="/auth/party-management"
                        method="post"
                        className="mt-5 grid gap-4 sm:grid-cols-2"
                    >
                        {fields("add-identifier")}
                        <div>
                            <Label htmlFor="identifier-type">{t("identifiers.type")}</Label>
                            <Input id="identifier-type" name="type" maxLength={64} required />
                        </div>
                        <div>
                            <Label htmlFor="identifier-value">{t("identifiers.value")}</Label>
                            <Input
                                id="identifier-value"
                                name="originalValue"
                                maxLength={255}
                                required
                            />
                        </div>
                        <Button className="sm:col-span-2 sm:justify-self-start" type="submit">
                            {t("identifiers.add")}
                        </Button>
                    </form>
                ) : null}
            </section>

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="party-duplicates-title"
            >
                <h2 id="party-duplicates-title" className="font-display text-xl font-semibold">
                    {t("duplicates.title")}
                </h2>
                {party.duplicateCandidates.length ? (
                    <>
                        <p className="mt-2 text-sm text-muted-foreground">{t("duplicates.hint")}</p>
                        <ul className="mt-3 list-inside list-disc">
                            {party.duplicateCandidates.map((candidate) => (
                                <li key={`${candidate.id}-${candidate.matchedType}`}>
                                    <Link
                                        href={`/${locale}/app/parties/${candidate.id}`}
                                        className="text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                                    >
                                        {candidate.displayName}
                                    </Link>{" "}
                                    · {candidate.matchedType}
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <p className="mt-3 text-sm text-muted-foreground">{t("duplicates.none")}</p>
                )}
            </section>

            <ContactsSection locale={locale} party={party} canWrite={canWrite} />
            <AddressesSection locale={locale} party={party} canWrite={canWrite} />

            {canArchive ? (
                <section className="rounded-card border border-border bg-surface p-5 sm:p-6">
                    <p className="text-sm text-muted-foreground">{t("lifecycle.archivedHint")}</p>
                    <details className="mt-4">
                        <summary className="cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {party.status === "active"
                                ? t("lifecycle.confirmArchive")
                                : t("lifecycle.confirmRestore")}
                        </summary>
                        <form action="/auth/party-management" method="post" className="mt-4">
                            {fields(party.status === "active" ? "archive" : "restore")}
                            <Button
                                type="submit"
                                variant={party.status === "active" ? "destructive" : "default"}
                            >
                                {party.status === "active"
                                    ? t("lifecycle.archive")
                                    : t("lifecycle.restore")}
                            </Button>
                        </form>
                    </details>
                </section>
            ) : null}
        </div>
    );
}
