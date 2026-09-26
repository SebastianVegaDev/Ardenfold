"use client";

import {
    restructureWorkItemSchema,
    updateWorkItemSchema,
    workItemTransitionSchema,
    type AssetSummary,
    type WorkItemReadinessBlocker,
    type WorkOrderDetail,
} from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import type { Locale } from "@/i18n/locales";

import { searchWorkAssets } from "../api/browser-client";
import { quantityUnits, unitsToQuantity } from "./allocation-quantity";

type Item = WorkOrderDetail["items"][number];
type Props = Readonly<{
    locale: Locale;
    order: WorkOrderDetail;
    item: Item;
    assetName: string | null;
    fixedAssetId: string | null;
    blocker: WorkItemReadinessBlocker | null;
    readinessAvailable: boolean;
    canWrite: boolean;
    canReadAssets: boolean;
    reason: string;
    onAction: (intent: string, payload: unknown, itemId?: string) => Promise<void>;
}>;

export function WorkItemCard({
    locale,
    order,
    item,
    assetName,
    fixedAssetId,
    blocker,
    readinessAvailable,
    canWrite,
    canReadAssets,
    reason,
    onAction,
}: Props) {
    const t = useTranslations("workOrders");
    const [editing, setEditing] = useState(false);
    const [scopeDescription, setScopeDescription] = useState(item.scopeDescription);
    const [assetId, setAssetId] = useState(item.assetId);
    const [selectedAssetName, setSelectedAssetName] = useState(assetName);
    const [unresolved, setUnresolved] = useState(item.unresolvedAssetDescription ?? "");
    const [serviceMode, setServiceMode] = useState(item.serviceMode);
    const [notes, setNotes] = useState(item.preparationNotes ?? "");
    const [assetQuery, setAssetQuery] = useState("");
    const [assetResults, setAssetResults] = useState<AssetSummary[]>([]);
    const [splitQuantity, setSplitQuantity] = useState("");
    const [error, setError] = useState("");
    const [searching, setSearching] = useState(false);

    function requireReason(): boolean {
        if (reason.trim()) return true;
        setError(t("reasonRequired"));
        return false;
    }

    async function findAsset() {
        const query = assetQuery.trim();
        if (query && query.length < 2) return;
        setSearching(true);
        setError("");
        try {
            setAssetResults((await searchWorkAssets(query)).data);
        } catch {
            setError(t("lookupError"));
        } finally {
            setSearching(false);
        }
    }

    function save() {
        if (!requireReason()) return;
        const parsed = updateWorkItemSchema.safeParse({
            expectedOrderVersion: order.version,
            expectedItemVersion: item.version,
            reason: reason.trim(),
            scopeDescription: scopeDescription.trim(),
            assetId,
            unresolvedAssetDescription: assetId ? null : unresolved.trim() || null,
            serviceMode,
            preparationNotes: notes.trim() || null,
        });
        if (!parsed.success) {
            setError(t("validationError"));
            return;
        }
        void onAction("updateItem", parsed.data, item.id).then(() => setEditing(false));
    }

    function transition(intent: "readyItem" | "plannedItem" | "cancelItem") {
        if (!requireReason()) return;
        const parsed = workItemTransitionSchema.safeParse({
            expectedOrderVersion: order.version,
            expectedItemVersion: item.version,
            reason: reason.trim(),
        });
        if (parsed.success) void onAction(intent, parsed.data, item.id);
    }

    function split() {
        if (!requireReason()) return;
        const total = quantityUnits(item.allocatedQuantity);
        const first = quantityUnits(splitQuantity);
        if (total === null || first === null || first <= 0n || first >= total) {
            setError(t("splitInvalid"));
            return;
        }
        const original = {
            sourceRevisionLineId: item.sourceRevisionLineId,
            scopeDescription: item.scopeDescription,
            allocatedUnit: item.allocatedUnit,
            partyId: item.partyId,
            assetRequirement: item.assetRequirement,
            assetId: item.assetId,
            unresolvedAssetDescription: item.unresolvedAssetDescription,
            serviceMode: item.serviceMode,
        };
        const parsed = restructureWorkItemSchema.safeParse({
            expectedOrderVersion: order.version,
            expectedItemVersion: item.version,
            reason: reason.trim(),
            replacements: [
                { ...original, allocatedQuantity: unitsToQuantity(first) },
                { ...original, allocatedQuantity: unitsToQuantity(total - first) },
            ],
        });
        if (!parsed.success) {
            setError(t("splitInvalid"));
            return;
        }
        void onAction("restructureItem", parsed.data, item.id);
    }

    return (
        <article
            className="space-y-4 rounded-card border border-border bg-surface p-5"
            aria-labelledby={`work-item-${item.id}`}
        >
            <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 id={`work-item-${item.id}`} className="font-semibold">
                        {t("item", { number: item.itemNumber })}: {item.scopeDescription}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {item.allocatedQuantity} {item.allocatedUnit} ·{" "}
                        {t(`statuses.${item.status}`)} · {t("version", { version: item.version })}
                    </p>
                </div>
                {item.replacesItemId ? (
                    <span className="text-xs text-muted-foreground">{t("replacementItem")}</span>
                ) : null}
            </header>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                    <dt className="font-semibold">{t("asset")}</dt>
                    <dd>
                        {item.assetRequirement === "not_applicable" ? (
                            t("assetNotApplicable")
                        ) : item.assetId ? (
                            <Link
                                className="text-primary underline"
                                href={`/${locale}/app/assets/${item.assetId}`}
                            >
                                {assetName ?? item.assetId}
                            </Link>
                        ) : (
                            (item.unresolvedAssetDescription ?? t("assetUnresolved"))
                        )}
                    </dd>
                </div>
                <div>
                    <dt className="font-semibold">{t("serviceMode")}</dt>
                    <dd>
                        {t(item.serviceMode === "physical_intake" ? "physicalIntake" : "noIntake")}
                    </dd>
                </div>
            </dl>
            {item.serviceMode === "no_intake" ? (
                <p className="text-sm text-muted-foreground">{t("noReceiptNeeded")}</p>
            ) : null}
            {item.preparationNotes ? (
                <p className="text-sm whitespace-pre-wrap">{item.preparationNotes}</p>
            ) : null}
            {readinessAvailable ? (
                <p role="status" className="rounded-control border border-border p-3 text-sm">
                    {blocker ? t(`readiness.${blocker}`) : t("readinessEligible")}
                </p>
            ) : (
                <p className="text-sm text-muted-foreground">{t("readinessUnavailable")}</p>
            )}
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}
            {canWrite && item.status !== "cancelled" ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditing((value) => !value)}
                        >
                            {editing ? t("closeEditor") : t("editItem")}
                        </Button>
                        {item.status === "planned" ? (
                            <Button
                                type="button"
                                onClick={() => transition("readyItem")}
                                disabled={Boolean(blocker)}
                            >
                                {t("markItemReady")}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => transition("plannedItem")}
                            >
                                {t("returnToPlanned")}
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => transition("cancelItem")}
                        >
                            {t("excludeItem")}
                        </Button>
                    </div>
                    {editing ? (
                        <fieldset className="space-y-3 rounded-control border border-border p-4">
                            <legend className="px-1 font-semibold">{t("editItem")}</legend>
                            <div>
                                <Label htmlFor={`item-scope-${item.id}`}>
                                    {t("operationalScope")}
                                </Label>
                                <Input
                                    id={`item-scope-${item.id}`}
                                    value={scopeDescription}
                                    maxLength={10000}
                                    onChange={(event) => setScopeDescription(event.target.value)}
                                />
                            </div>
                            {item.assetRequirement === "required" ? (
                                <>
                                    <p>
                                        {t("knownAsset")}:{" "}
                                        {assetId
                                            ? (selectedAssetName ?? assetId)
                                            : t("assetUnresolved")}
                                    </p>
                                    {!fixedAssetId ? (
                                        <>
                                            {assetId ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setAssetId(null);
                                                        setSelectedAssetName(null);
                                                    }}
                                                >
                                                    {t("removeAsset")}
                                                </Button>
                                            ) : (
                                                <div>
                                                    <Label htmlFor={`item-unknown-${item.id}`}>
                                                        {t("unresolvedAsset")}
                                                    </Label>
                                                    <Input
                                                        id={`item-unknown-${item.id}`}
                                                        value={unresolved}
                                                        maxLength={10000}
                                                        onChange={(event) =>
                                                            setUnresolved(event.target.value)
                                                        }
                                                    />
                                                </div>
                                            )}
                                            {canReadAssets ? (
                                                <div>
                                                    <Label htmlFor={`item-asset-search-${item.id}`}>
                                                        {t("assetSearch")}
                                                    </Label>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Input
                                                            id={`item-asset-search-${item.id}`}
                                                            value={assetQuery}
                                                            type="search"
                                                            maxLength={100}
                                                            className="min-w-48 flex-1"
                                                            onChange={(event) =>
                                                                setAssetQuery(event.target.value)
                                                            }
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            disabled={searching}
                                                            onClick={() => void findAsset()}
                                                        >
                                                            {t("search")}
                                                        </Button>
                                                    </div>
                                                    {assetResults.length ? (
                                                        <ul
                                                            className="max-h-40 overflow-auto"
                                                            aria-label={t("assetResults")}
                                                        >
                                                            {assetResults.map((asset) => (
                                                                <li key={asset.id}>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        onClick={() => {
                                                                            setAssetId(asset.id);
                                                                            setSelectedAssetName(
                                                                                asset.displayName,
                                                                            );
                                                                            setAssetResults([]);
                                                                        }}
                                                                    >
                                                                        {asset.displayName}
                                                                    </Button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </>
                                    ) : null}
                                    <div>
                                        <Label htmlFor={`item-mode-${item.id}`}>
                                            {t("serviceMode")}
                                        </Label>
                                        <select
                                            id={`item-mode-${item.id}`}
                                            value={serviceMode}
                                            onChange={(event) =>
                                                setServiceMode(
                                                    event.target.value as Item["serviceMode"],
                                                )
                                            }
                                            className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                                        >
                                            <option value="physical_intake">
                                                {t("physicalIntake")}
                                            </option>
                                            <option value="no_intake">{t("noIntake")}</option>
                                        </select>
                                    </div>
                                </>
                            ) : null}
                            <div>
                                <Label htmlFor={`item-notes-${item.id}`}>
                                    {t("preparationNotes")}
                                </Label>
                                <Input
                                    id={`item-notes-${item.id}`}
                                    value={notes}
                                    maxLength={10000}
                                    onChange={(event) => setNotes(event.target.value)}
                                />
                            </div>
                            <Button type="button" onClick={save}>
                                {t("saveItem")}
                            </Button>
                        </fieldset>
                    ) : null}
                    {item.status === "planned" ? (
                        <fieldset className="space-y-3 rounded-control border border-border p-4">
                            <legend className="px-1 font-semibold">{t("splitItem")}</legend>
                            <p className="text-sm text-muted-foreground">
                                {t("splitHint", {
                                    quantity: item.allocatedQuantity,
                                    unit: item.allocatedUnit,
                                })}
                            </p>
                            <div>
                                <Label htmlFor={`item-split-${item.id}`}>
                                    {t("firstQuantity")}
                                </Label>
                                <Input
                                    id={`item-split-${item.id}`}
                                    inputMode="decimal"
                                    value={splitQuantity}
                                    onChange={(event) => setSplitQuantity(event.target.value)}
                                />
                            </div>
                            <Button type="button" variant="outline" onClick={split}>
                                {t("splitItem")}
                            </Button>
                        </fieldset>
                    ) : null}
                </div>
            ) : null}
        </article>
    );
}
