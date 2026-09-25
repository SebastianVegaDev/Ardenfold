"use client";
import type { AssetSummary } from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import { useState, type Dispatch, type SetStateAction } from "react";
import { searchAssets } from "../api/browser-client";

export type ScopeDraft = {
    key: string;
    id?: string;
    description: string;
    assetId: string | null;
    assetName: string;
    unidentifiedAssetDescription: string;
};

type Props = Readonly<{
    scope: ScopeDraft[];
    setScope: Dispatch<SetStateAction<ScopeDraft[]>>;
    canReadAssets: boolean;
    busy: boolean;
    setBusy: (value: boolean) => void;
    setError: (value: string) => void;
}>;

export function ScopeFields({ scope, setScope, canReadAssets, busy, setBusy, setError }: Props) {
    const t = useTranslations("serviceRequests");
    const [assetQuery, setAssetQuery] = useState<Record<string, string>>({});
    const [assetResults, setAssetResults] = useState<Record<string, AssetSummary[]>>({});
    const [searched, setSearched] = useState<Record<string, boolean>>({});
    const [moreResults, setMoreResults] = useState<Record<string, boolean>>({});
    function updateScope(key: string, patch: Partial<ScopeDraft>) {
        setScope((current) =>
            current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
        );
    }

    async function findAsset(key: string) {
        setBusy(true);
        setError("");
        try {
            const result = await searchAssets(assetQuery[key]?.trim() ?? "");
            setAssetResults((current) => ({ ...current, [key]: result.data }));
            setSearched((current) => ({ ...current, [key]: true }));
            setMoreResults((current) => ({ ...current, [key]: result.nextCursor !== null }));
        } catch {
            setError(t("lookupError"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section
            className="space-y-4 rounded-card border border-border bg-surface p-5"
            aria-labelledby="request-scope-heading"
        >
            <h2 id="request-scope-heading" className="font-display text-xl font-semibold">
                {t("scopeSection")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("scopeHint")}</p>
            {scope.map((item, index) => (
                <fieldset
                    key={item.key}
                    className="space-y-3 rounded-control border border-border p-4"
                >
                    <legend className="px-1 font-semibold">
                        {t("scopeItem", { number: index + 1 })}
                    </legend>
                    <div>
                        <Label htmlFor={`scope-description-${item.key}`}>
                            {t("scopeDescription")}
                        </Label>
                        <Input
                            id={`scope-description-${item.key}`}
                            value={item.description}
                            onChange={(event) =>
                                updateScope(item.key, { description: event.target.value })
                            }
                            required
                            maxLength={10000}
                        />
                    </div>
                    <div>
                        <Label htmlFor={`scope-unknown-${item.key}`}>
                            {t("unidentifiedAsset")}
                        </Label>
                        <Input
                            id={`scope-unknown-${item.key}`}
                            value={item.unidentifiedAssetDescription}
                            onChange={(event) =>
                                updateScope(item.key, {
                                    unidentifiedAssetDescription: event.target.value,
                                })
                            }
                            maxLength={10000}
                        />
                    </div>
                    {item.assetId ? (
                        <p>
                            {t("knownAsset")}: <strong>{item.assetName}</strong>{" "}
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() =>
                                    updateScope(item.key, { assetId: null, assetName: "" })
                                }
                            >
                                {t("removeAsset")}
                            </Button>
                        </p>
                    ) : null}
                    {canReadAssets ? (
                        <div>
                            <Label htmlFor={`asset-search-${item.key}`}>{t("assetSearch")}</Label>
                            <div className="flex flex-wrap items-end gap-3">
                                <Input
                                    id={`asset-search-${item.key}`}
                                    type="search"
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            const query = assetQuery[item.key]?.trim() ?? "";
                                            if (!busy && (!query || query.length >= 2))
                                                void findAsset(item.key);
                                        }
                                    }}
                                    className="min-w-48 flex-1"
                                    value={assetQuery[item.key] ?? ""}
                                    onChange={(event) =>
                                        setAssetQuery((current) => ({
                                            ...current,
                                            [item.key]: event.target.value,
                                        }))
                                    }
                                    maxLength={100}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        busy ||
                                        (!!assetQuery[item.key] &&
                                            assetQuery[item.key]!.trim().length < 2)
                                    }
                                    onClick={() => void findAsset(item.key)}
                                >
                                    {t("search")}
                                </Button>
                            </div>
                            {assetResults[item.key]?.length ? (
                                <ul
                                    className="max-h-40 overflow-auto"
                                    aria-label={t("assetResults")}
                                >
                                    {assetResults[item.key]!.map((asset) => (
                                        <li key={asset.id}>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => {
                                                    updateScope(item.key, {
                                                        assetId: asset.id,
                                                        assetName: asset.displayName,
                                                    });
                                                    setAssetResults((current) => ({
                                                        ...current,
                                                        [item.key]: [],
                                                    }));
                                                    setSearched((current) => ({
                                                        ...current,
                                                        [item.key]: false,
                                                    }));
                                                }}
                                            >
                                                {asset.displayName}
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {searched[item.key] && !assetResults[item.key]?.length ? (
                                <p role="status">{t("noLookupResults")}</p>
                            ) : null}
                            {searched[item.key] && moreResults[item.key] ? (
                                <p className="text-sm text-muted-foreground">{t("refineSearch")}</p>
                            ) : null}
                        </div>
                    ) : null}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                            setScope((current) =>
                                current.filter((candidate) => candidate.key !== item.key),
                            )
                        }
                    >
                        {t("removeScope")}
                    </Button>
                </fieldset>
            ))}
            {scope.length < 100 ? (
                <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                        setScope((current) => [
                            ...current,
                            {
                                key: crypto.randomUUID(),
                                description: "",
                                assetId: null,
                                assetName: "",
                                unidentifiedAssetDescription: "",
                            },
                        ])
                    }
                >
                    {t("addScope")}
                </Button>
            ) : null}
        </section>
    );
}
