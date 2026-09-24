import { identifierSchema } from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
    AssetApiError,
    getAsset,
    getAssetHistory,
    getCurrentRelationships,
    getRelationshipHistory,
    listAvailableSites,
} from "@/features/assets/api-client";
import { AssetFormFields } from "@/features/assets/asset-form-fields";
import { RelationshipForm } from "@/features/assets/relationship-form";
import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";
import { listParties } from "@/features/parties/api-client";

type Props = Readonly<{
    params: Promise<{ locale: Locale; assetId: string }>;
    searchParams: Promise<{ notice?: string; historyCursor?: string; relationshipCursor?: string }>;
}>;

export default async function AssetDetailPage({ params, searchParams }: Props) {
    const [{ locale, assetId }, query, t, context] = await Promise.all([
        params,
        searchParams,
        getTranslations("assets"),
        getActiveOrganizationSession(),
    ]);
    if (!identifierSchema.safeParse(assetId).success) notFound();
    const { session, organization } = context;
    const active = await getActiveOrganization(session.accessToken, organization.id);
    if (!active.permissions.includes("assets.read")) {
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {t("forbidden")}
                </p>
            </div>
        );
    }
    const historyParams = new URLSearchParams();
    if (query.historyCursor) historyParams.set("cursor", query.historyCursor);
    const relationshipParams = new URLSearchParams();
    if (query.relationshipCursor) relationshipParams.set("cursor", query.relationshipCursor);
    let data;
    try {
        data = await Promise.all([
            getAsset(session.accessToken, organization.id, assetId),
            getCurrentRelationships(session.accessToken, organization.id, assetId),
            getAssetHistory(session.accessToken, organization.id, assetId, historyParams),
            getRelationshipHistory(
                session.accessToken,
                organization.id,
                assetId,
                relationshipParams,
            ),
        ]);
    } catch (error) {
        if (error instanceof AssetApiError && error.status === 404) notFound();
        return (
            <div className="mx-auto max-w-6xl p-6 sm:p-8">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p role="alert" className="mt-4">
                    {error instanceof AssetApiError && error.status === 403
                        ? t("forbidden")
                        : t("loadError")}
                </p>
            </div>
        );
    }
    const [asset, current, history, relationshipHistory] = data;
    const canWrite = active.permissions.includes("assets.write") && asset.status === "active";
    const canArchive = active.permissions.includes("assets.archive");
    const canManageRelationships =
        active.permissions.includes("assets.manage_relationships") && asset.status === "active";
    const [parties, sites] = canManageRelationships
        ? await Promise.all([
              active.permissions.includes("parties.read")
                  ? listParties(
                        session.accessToken,
                        organization.id,
                        new URLSearchParams({ status: "active", limit: "100" }),
                    )
                        .then((result) => result.data)
                        .catch(() => [])
                  : Promise.resolve([]),
              listAvailableSites(session.accessToken, organization.id)
                  .then((result) => result.data)
                  .catch(() => []),
          ])
        : [[], []];
    const date = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: active.defaultTimeZone,
    });
    const format = (value: string) => date.format(new Date(value));
    const fields = (intent: string) => (
        <AssetFormFields
            locale={locale}
            assetId={asset.id}
            version={asset.version}
            intent={intent}
        />
    );
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
    const kinds = ["ownership", "custody", "location"] as const;
    const lifecycles = ["registered", "in_service", "out_of_service", "retired"] as const;
    const target = (relationship: NonNullable<typeof current.ownership>) => {
        if (relationship.subject === "party")
            return (
                parties.find((party) => party.id === relationship.partyId)?.displayName ??
                relationship.partyId
            );
        if (relationship.subject === "site")
            return (
                sites.find((site) => site.id === relationship.siteId)?.name ?? relationship.siteId
            );
        if (relationship.subject === "party_address") return relationship.partyAddressId;
        if (relationship.subject === "freeform") return relationship.locationDescription;
        return t("relationships.recording_organization");
    };

    return (
        <div className="mx-auto max-w-6xl space-y-8 p-6 sm:p-8">
            <header>
                <Link
                    href={`/${locale}/app/assets`}
                    className="text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                    {t("back")}
                </Link>
                <h1 className="mt-3 font-display text-3xl font-semibold">{asset.displayName}</h1>
                <p className="mt-2 text-muted-foreground">
                    {t(`lifecycles.${asset.lifecycle}`)} · {t(`statuses.${asset.status}`)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                    {t("detail.created")}: {format(asset.createdAt)} · {t("detail.updated")}:{" "}
                    {format(asset.updatedAt)}
                </p>
                {notice ? (
                    <p
                        role={query.notice === "success" ? "status" : "alert"}
                        className="mt-4 rounded-control border border-border p-3 text-sm"
                    >
                        {notice}
                    </p>
                ) : null}
                {!canWrite && asset.status === "active" ? (
                    <p className="mt-3 text-sm text-muted-foreground">{t("detail.readOnly")}</p>
                ) : null}
            </header>

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="asset-profile-title"
            >
                <h2 id="asset-profile-title" className="font-display text-xl font-semibold">
                    {t("detail.profile")}
                </h2>
                {canWrite ? (
                    <form
                        action="/auth/asset-management"
                        method="post"
                        className="mt-4 grid gap-4 sm:grid-cols-2"
                    >
                        {fields("update")}
                        <div>
                            <Label htmlFor="asset-name">{t("displayName")}</Label>
                            <Input
                                id="asset-name"
                                name="displayName"
                                defaultValue={asset.displayName}
                                required
                                maxLength={200}
                            />
                        </div>
                        <div>
                            <Label htmlFor="asset-classification">{t("classification")}</Label>
                            <Input
                                id="asset-classification"
                                name="classification"
                                defaultValue={asset.classification ?? ""}
                                maxLength={120}
                            />
                        </div>
                        <div>
                            <Label htmlFor="asset-manufacturer">{t("manufacturer")}</Label>
                            <Input
                                id="asset-manufacturer"
                                name="manufacturer"
                                defaultValue={asset.manufacturer ?? ""}
                                maxLength={200}
                            />
                        </div>
                        <div>
                            <Label htmlFor="asset-model">{t("model")}</Label>
                            <Input
                                id="asset-model"
                                name="model"
                                defaultValue={asset.model ?? ""}
                                maxLength={200}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <Label htmlFor="asset-description">{t("descriptionField")}</Label>
                            <textarea
                                id="asset-description"
                                name="description"
                                defaultValue={asset.description ?? ""}
                                rows={3}
                                maxLength={10000}
                                className="mt-2 w-full rounded-control border border-border bg-surface px-3 py-2"
                            />
                        </div>
                        <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
                            {t("detail.save")}
                        </Button>
                    </form>
                ) : (
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                            <dt className="text-sm text-muted-foreground">{t("classification")}</dt>
                            <dd>{asset.classification ?? "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-sm text-muted-foreground">{t("manufacturer")}</dt>
                            <dd>{asset.manufacturer ?? "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-sm text-muted-foreground">{t("model")}</dt>
                            <dd>{asset.model ?? "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-sm text-muted-foreground">
                                {t("descriptionField")}
                            </dt>
                            <dd>{asset.description ?? "—"}</dd>
                        </div>
                    </dl>
                )}
            </section>

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="asset-identifiers-title"
            >
                <h2 id="asset-identifiers-title" className="font-display text-xl font-semibold">
                    {t("identifiers.title")}
                </h2>
                {asset.identifiers.length ? (
                    <ul className="mt-4 divide-y divide-border">
                        {asset.identifiers.map((identifier) => (
                            <li key={identifier.id} className="py-4">
                                <p className="text-sm">
                                    <span className="font-medium">{identifier.type}</span> ·{" "}
                                    {identifier.originalValue} ·{" "}
                                    {t(`identifiers.${identifier.status}`)}
                                </p>
                                {canWrite && identifier.status === "active" ? (
                                    <div className="mt-3 flex flex-wrap gap-4">
                                        <details>
                                            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                                                {t("identifiers.change")}
                                            </summary>
                                            <form
                                                action="/auth/asset-management"
                                                method="post"
                                                className="mt-3 flex flex-wrap items-end gap-3"
                                            >
                                                {fields("change-identifier")}
                                                <input
                                                    type="hidden"
                                                    name="identifierId"
                                                    value={identifier.id}
                                                />
                                                <div>
                                                    <Label
                                                        htmlFor={`identifier-type-${identifier.id}`}
                                                    >
                                                        {t("identifiers.type")}
                                                    </Label>
                                                    <Input
                                                        id={`identifier-type-${identifier.id}`}
                                                        name="type"
                                                        defaultValue={identifier.type}
                                                        maxLength={64}
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <Label
                                                        htmlFor={`identifier-value-${identifier.id}`}
                                                    >
                                                        {t("identifiers.value")}
                                                    </Label>
                                                    <Input
                                                        id={`identifier-value-${identifier.id}`}
                                                        name="originalValue"
                                                        defaultValue={identifier.originalValue}
                                                        maxLength={255}
                                                        required
                                                    />
                                                </div>
                                                <Button type="submit">
                                                    {t("identifiers.change")}
                                                </Button>
                                            </form>
                                        </details>
                                        <form action="/auth/asset-management" method="post">
                                            {fields("retire-identifier")}
                                            <input
                                                type="hidden"
                                                name="identifierId"
                                                value={identifier.id}
                                            />
                                            <Button type="submit" variant="outline" size="sm">
                                                {t("identifiers.retire")}
                                            </Button>
                                        </form>
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-4 text-sm text-muted-foreground">{t("identifiers.empty")}</p>
                )}
                {canWrite ? (
                    <form
                        action="/auth/asset-management"
                        method="post"
                        className="mt-5 grid gap-4 sm:grid-cols-2"
                    >
                        {fields("add-identifier")}
                        <div>
                            <Label htmlFor="add-identifier-type">{t("identifiers.type")}</Label>
                            <Input id="add-identifier-type" name="type" maxLength={64} required />
                        </div>
                        <div>
                            <Label htmlFor="add-identifier-value">{t("identifiers.value")}</Label>
                            <Input
                                id="add-identifier-value"
                                name="originalValue"
                                maxLength={255}
                                required
                            />
                        </div>
                        <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
                            {t("identifiers.add")}
                        </Button>
                    </form>
                ) : null}
                <p className="mt-4 text-xs text-muted-foreground">{t("identifiers.historyHint")}</p>
            </section>

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="asset-duplicates-title"
            >
                <h2 id="asset-duplicates-title" className="font-display text-xl font-semibold">
                    {t("duplicates.title")}
                </h2>
                {asset.duplicateCandidates.length ? (
                    <>
                        <p className="mt-2 text-sm text-muted-foreground">{t("duplicates.hint")}</p>
                        <ul className="mt-3 list-inside list-disc">
                            {asset.duplicateCandidates.map((candidate) => (
                                <li key={candidate.id}>
                                    <Link
                                        href={`/${locale}/app/assets/${candidate.id}`}
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

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="asset-relationships-title"
            >
                <h2 id="asset-relationships-title" className="font-display text-xl font-semibold">
                    {t("relationships.title")}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    {t("relationships.changeHint")}
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    {kinds.map((kind) => {
                        const relationship = current[kind];
                        return (
                            <div key={kind} className="rounded-control border border-border p-4">
                                <h3 className="font-semibold">{t(`relationships.${kind}`)}</h3>
                                {relationship ? (
                                    <p className="mt-2 text-sm">
                                        {t(`relationships.${relationship.subject}`)}:{" "}
                                        {target(relationship)}
                                        <br />
                                        {t("relationships.from")}:{" "}
                                        {format(relationship.effectiveFrom)}
                                    </p>
                                ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {t("relationships.none")}
                                    </p>
                                )}
                                {canManageRelationships ? (
                                    <RelationshipForm
                                        locale={locale}
                                        assetId={asset.id}
                                        version={asset.version}
                                        kind={kind}
                                        current={relationship}
                                        parties={parties}
                                        sites={sites}
                                    />
                                ) : null}
                            </div>
                        );
                    })}
                </div>
                <h3 className="mt-8 font-display text-lg font-semibold">
                    {t("relationships.history")}
                </h3>
                {relationshipHistory.data.length ? (
                    <ol className="mt-3 divide-y divide-border">
                        {relationshipHistory.data.map((entry) => (
                            <li key={entry.id} className="py-3 text-sm">
                                <span className="font-medium">
                                    {t(`relationships.${entry.kind}`)}
                                </span>{" "}
                                · {t(`relationships.${entry.subject}`)}: {target(entry)} ·{" "}
                                {t("history.version")} {entry.aggregateVersion} ·{" "}
                                {format(entry.recordedAt)}
                                {entry.revisionReason ? (
                                    <p className="text-muted-foreground">{entry.revisionReason}</p>
                                ) : null}
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                        {t("relationships.historyEmpty")}
                    </p>
                )}
                {relationshipHistory.nextCursor ? (
                    <Link
                        className="mt-4 inline-flex text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                        href={`/${locale}/app/assets/${asset.id}?${new URLSearchParams({ ...(query.historyCursor ? { historyCursor: query.historyCursor } : {}), relationshipCursor: relationshipHistory.nextCursor }).toString()}`}
                    >
                        {t("history.viewEarlier")}
                    </Link>
                ) : null}
            </section>

            <section
                className="rounded-card border border-border bg-surface p-5 sm:p-6"
                aria-labelledby="asset-history-title"
            >
                <h2 id="asset-history-title" className="font-display text-xl font-semibold">
                    {t("history.title")}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("history.auditNote")}</p>
                {history.data.length ? (
                    <ol className="mt-4 divide-y divide-border">
                        {history.data.map((entry) => (
                            <li key={entry.id} className="py-3 text-sm">
                                <span className="font-medium">
                                    {t(`history.events.${entry.event}`)}
                                </span>{" "}
                                · {t("history.version")} {entry.aggregateVersion} ·{" "}
                                {format(entry.occurredAt)}
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="mt-4 text-sm text-muted-foreground">{t("history.empty")}</p>
                )}
                {history.nextCursor ? (
                    <Link
                        className="mt-4 inline-flex text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                        href={`/${locale}/app/assets/${asset.id}?${new URLSearchParams({ historyCursor: history.nextCursor, ...(query.relationshipCursor ? { relationshipCursor: query.relationshipCursor } : {}) }).toString()}`}
                    >
                        {t("history.viewEarlier")}
                    </Link>
                ) : null}
            </section>

            {canWrite || canArchive ? (
                <section
                    className="rounded-card border border-border bg-surface p-5 sm:p-6"
                    aria-labelledby="asset-lifecycle-title"
                >
                    <h2 id="asset-lifecycle-title" className="font-display text-xl font-semibold">
                        {t("lifecycle.title")}
                    </h2>
                    {canWrite ? (
                        <form
                            action="/auth/asset-management"
                            method="post"
                            className="mt-4 flex flex-wrap items-end gap-4"
                        >
                            {fields("lifecycle")}
                            <div>
                                <Label htmlFor="asset-lifecycle">{t("lifecycleLabel")}</Label>
                                <select
                                    id="asset-lifecycle"
                                    name="lifecycle"
                                    defaultValue={asset.lifecycle}
                                    className="mt-2 h-10 rounded-control border border-border bg-surface px-3"
                                >
                                    {lifecycles.map((lifecycle) => (
                                        <option key={lifecycle} value={lifecycle}>
                                            {t(`lifecycles.${lifecycle}`)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <Button type="submit">{t("lifecycle.set")}</Button>
                        </form>
                    ) : null}
                    {canArchive ? (
                        <details className="mt-5">
                            <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
                                {asset.status === "active"
                                    ? t("lifecycle.confirmArchive")
                                    : t("lifecycle.confirmRestore")}
                            </summary>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {t("lifecycle.archivedHint")}
                            </p>
                            <form action="/auth/asset-management" method="post" className="mt-3">
                                {fields(asset.status === "active" ? "archive" : "restore")}
                                <Button
                                    type="submit"
                                    variant={asset.status === "active" ? "destructive" : "default"}
                                >
                                    {asset.status === "active"
                                        ? t("lifecycle.archive")
                                        : t("lifecycle.restore")}
                                </Button>
                            </form>
                        </details>
                    ) : null}
                </section>
            ) : null}
        </div>
    );
}
