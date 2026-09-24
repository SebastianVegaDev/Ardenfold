"use client";

import type { AssetRelationship, OrganizationSite, PartySummary } from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AssetFormFields } from "@/assets/asset-form-fields";
import type { Locale } from "@/i18n/locales";

type Kind = "ownership" | "custody" | "location";
type Subject = AssetRelationship["subject"];

type Props = Readonly<{
    locale: Locale;
    assetId: string;
    version: number;
    kind: Kind;
    current: AssetRelationship | null;
    parties: PartySummary[];
    sites: OrganizationSite[];
}>;

export function RelationshipForm({
    locale,
    assetId,
    version,
    kind,
    current,
    parties,
    sites,
}: Props) {
    const t = useTranslations("assets.relationships");
    const [subject, setSubject] = useState<Subject>(
        current?.subject ?? (kind === "location" ? "site" : "party"),
    );
    const [correctionSubject, setCorrectionSubject] = useState<Subject>(
        current?.subject ?? (kind === "location" ? "site" : "party"),
    );
    const choices: Subject[] =
        kind === "location"
            ? ["site", "party_address", "freeform"]
            : ["party", "recording_organization"];
    const effectiveAt = new Date().toISOString();
    const fields = (intent: string) => (
        <AssetFormFields locale={locale} assetId={assetId} version={version} intent={intent} />
    );

    return (
        <div className="mt-4 space-y-4">
            <details>
                <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
                    {t("start")}
                </summary>
                <form
                    action="/auth/asset-management"
                    method="post"
                    className="mt-4 grid gap-4 sm:grid-cols-2"
                >
                    {fields("start-relationship")}
                    <input type="hidden" name="kind" value={kind} />
                    <div>
                        <Label htmlFor={`${kind}-subject`}>{t("subject")}</Label>
                        <select
                            id={`${kind}-subject`}
                            name="subject"
                            value={subject}
                            onChange={(event) => setSubject(event.target.value as Subject)}
                            className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                        >
                            {choices.map((choice) => (
                                <option key={choice} value={choice}>
                                    {t(choice)}
                                </option>
                            ))}
                        </select>
                    </div>
                    {subject === "party" ? (
                        <div>
                            <Label htmlFor={`${kind}-party`}>{t("partyChoice")}</Label>
                            <select
                                id={`${kind}-party`}
                                name="partyId"
                                required
                                defaultValue={current?.partyId ?? ""}
                                className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                            >
                                <option value="">{t("partyChoice")}</option>
                                {parties.map((party) => (
                                    <option key={party.id} value={party.id}>
                                        {party.displayName}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}
                    {subject === "site" ? (
                        <div>
                            <Label htmlFor={`${kind}-site`}>{t("siteChoice")}</Label>
                            <select
                                id={`${kind}-site`}
                                name="siteId"
                                required
                                defaultValue={current?.siteId ?? ""}
                                className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                            >
                                <option value="">{t("siteChoice")}</option>
                                {sites
                                    .filter((site) => site.isActive)
                                    .map((site) => (
                                        <option key={site.id} value={site.id}>
                                            {site.name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    ) : null}
                    {subject === "party_address" ? (
                        <div>
                            <Label htmlFor={`${kind}-party-address`}>{t("partyAddressId")}</Label>
                            <Input
                                id={`${kind}-party-address`}
                                name="partyAddressId"
                                defaultValue={current?.partyAddressId ?? ""}
                                required
                            />
                        </div>
                    ) : null}
                    {kind === "location" ? (
                        <div>
                            <Label htmlFor={`${kind}-description`}>
                                {t("locationDescription")}
                            </Label>
                            <Input
                                id={`${kind}-description`}
                                name="locationDescription"
                                defaultValue={current?.locationDescription ?? ""}
                                maxLength={500}
                                required
                            />
                        </div>
                    ) : null}
                    <div>
                        <Label htmlFor={`${kind}-effective`}>{t("effectiveAt")}</Label>
                        <Input
                            id={`${kind}-effective`}
                            name="effectiveAt"
                            type="text"
                            defaultValue={effectiveAt}
                            required
                        />
                    </div>
                    <p className="text-sm text-muted-foreground sm:col-span-2">{t("targetHelp")}</p>
                    <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
                        {t("start")}
                    </Button>
                </form>
            </details>
            {current ? (
                <>
                    <details>
                        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
                            {t("correct")}
                        </summary>
                        <form
                            action="/auth/asset-management"
                            method="post"
                            className="mt-4 grid gap-4 sm:grid-cols-2"
                        >
                            {fields("correct-relationship")}
                            <input type="hidden" name="kind" value={kind} />
                            <div>
                                <Label htmlFor={`${kind}-correct-subject`}>{t("subject")}</Label>
                                <select
                                    id={`${kind}-correct-subject`}
                                    name="subject"
                                    value={correctionSubject}
                                    onChange={(event) =>
                                        setCorrectionSubject(event.target.value as Subject)
                                    }
                                    className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                                >
                                    {choices.map((choice) => (
                                        <option key={choice} value={choice}>
                                            {t(choice)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {correctionSubject === "party" ? (
                                <div>
                                    <Label htmlFor={`${kind}-correct-party`}>
                                        {t("partyChoice")}
                                    </Label>
                                    <select
                                        id={`${kind}-correct-party`}
                                        name="partyId"
                                        required
                                        defaultValue={current.partyId ?? ""}
                                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                                    >
                                        <option value="">{t("partyChoice")}</option>
                                        {parties.map((party) => (
                                            <option key={party.id} value={party.id}>
                                                {party.displayName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}
                            {correctionSubject === "site" ? (
                                <div>
                                    <Label htmlFor={`${kind}-correct-site`}>
                                        {t("siteChoice")}
                                    </Label>
                                    <select
                                        id={`${kind}-correct-site`}
                                        name="siteId"
                                        required
                                        defaultValue={current.siteId ?? ""}
                                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                                    >
                                        <option value="">{t("siteChoice")}</option>
                                        {sites
                                            .filter((site) => site.isActive)
                                            .map((site) => (
                                                <option key={site.id} value={site.id}>
                                                    {site.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            ) : null}
                            {correctionSubject === "party_address" ? (
                                <div>
                                    <Label htmlFor={`${kind}-correct-address`}>
                                        {t("partyAddressId")}
                                    </Label>
                                    <Input
                                        id={`${kind}-correct-address`}
                                        name="partyAddressId"
                                        defaultValue={current.partyAddressId ?? ""}
                                        required
                                    />
                                </div>
                            ) : null}
                            {kind === "location" ? (
                                <div>
                                    <Label htmlFor={`${kind}-correct-description`}>
                                        {t("locationDescription")}
                                    </Label>
                                    <Input
                                        id={`${kind}-correct-description`}
                                        name="locationDescription"
                                        defaultValue={current.locationDescription ?? ""}
                                        maxLength={500}
                                        required
                                    />
                                </div>
                            ) : null}
                            <div>
                                <Label htmlFor={`${kind}-correct-time`}>{t("effectiveAt")}</Label>
                                <Input
                                    id={`${kind}-correct-time`}
                                    name="effectiveAt"
                                    defaultValue={current.effectiveFrom}
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor={`${kind}-reason`}>{t("reason")}</Label>
                                <Input
                                    id={`${kind}-reason`}
                                    name="reason"
                                    maxLength={500}
                                    required
                                />
                            </div>
                            <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
                                {t("correct")}
                            </Button>
                        </form>
                    </details>
                    <details>
                        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
                            {t("end")}
                        </summary>
                        <form
                            action="/auth/asset-management"
                            method="post"
                            className="mt-4 flex flex-wrap items-end gap-4"
                        >
                            {fields("end-relationship")}
                            <input type="hidden" name="kind" value={kind} />
                            <div>
                                <Label htmlFor={`${kind}-end-time`}>{t("effectiveAt")}</Label>
                                <Input
                                    id={`${kind}-end-time`}
                                    name="effectiveAt"
                                    defaultValue={effectiveAt}
                                    required
                                />
                            </div>
                            <Button variant="outline" type="submit">
                                {t("end")}
                            </Button>
                        </form>
                    </details>
                </>
            ) : null}
        </div>
    );
}
