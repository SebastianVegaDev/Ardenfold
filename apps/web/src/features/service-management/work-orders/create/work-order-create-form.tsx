"use client";

import {
    createWorkOrderSchema,
    type AssetSummary,
    type CreateWorkOrder,
    type OrganizationSite,
    type QuoteDetail,
    type ServiceRequestDetail,
} from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import type { Locale } from "@/i18n/locales";

import { searchWorkAssets, submitWorkOrder, WorkOrderWebError } from "../api/browser-client";
import { quantityUnits } from "../work-items/allocation-quantity";

type Revision = QuoteDetail["revisions"][number];
type Allocation = CreateWorkOrder["items"][number];
type Draft = Allocation & { key: string; assetName: string };
type Props = Readonly<{
    locale: Locale;
    quote: QuoteDetail;
    request: ServiceRequestDetail;
    revision: Revision;
    acceptanceId: string;
    sites: OrganizationSite[];
    canReadAssets: boolean;
}>;

function initialItems(revision: Revision): Draft[] {
    return revision.lines.map((line) => ({
        key: line.id,
        sourceRevisionLineId: line.id,
        scopeDescription: line.description,
        allocatedQuantity: line.quantity,
        allocatedUnit: line.unit,
        partyId: line.partyId ?? null,
        assetRequirement: line.assetId ? "required" : "not_applicable",
        assetId: line.assetId ?? null,
        assetName:
            typeof line.assetSnapshot?.displayName === "string"
                ? line.assetSnapshot.displayName
                : (line.assetId ?? ""),
        unresolvedAssetDescription: null,
        serviceMode: line.assetId ? "physical_intake" : "no_intake",
    }));
}

export function WorkOrderCreateForm({
    locale,
    quote,
    request,
    revision,
    acceptanceId,
    sites,
    canReadAssets,
}: Props) {
    const t = useTranslations("workOrders");
    const router = useRouter();
    const [reference, setReference] = useState("");
    const [siteId, setSiteId] = useState(
        request.siteId && sites.some((site) => site.id === request.siteId) ? request.siteId : "",
    );
    const [items, setItems] = useState<Draft[]>(() => initialItems(revision));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState(false);
    const [assetQuery, setAssetQuery] = useState<Record<string, string>>({});
    const [assetResults, setAssetResults] = useState<Record<string, AssetSummary[]>>({});
    const key = useRef<string | null>(null);

    function updateItem(itemKey: string, change: Partial<Draft>) {
        key.current = null;
        setItems((current) =>
            current.map((item) => (item.key === itemKey ? { ...item, ...change } : item)),
        );
    }

    async function findAsset(itemKey: string) {
        const query = assetQuery[itemKey]?.trim() ?? "";
        if (query && query.length < 2) return;
        setBusy(true);
        setError("");
        try {
            const result = await searchWorkAssets(query);
            setAssetResults((current) => ({ ...current, [itemKey]: result.data }));
        } catch {
            setError(t("lookupError"));
        } finally {
            setBusy(false);
        }
    }

    function split(item: Draft) {
        if (items.length >= 200) return;
        key.current = null;
        setItems((current) => [
            ...current,
            { ...item, key: crypto.randomUUID(), allocatedQuantity: "0" },
        ]);
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || conflict) return;
        setError("");
        const complete = revision.lines.every((line) => {
            const expected = quantityUnits(line.quantity);
            const allocation = items.filter((item) => item.sourceRevisionLineId === line.id);
            const amounts = allocation.map((item) => quantityUnits(item.allocatedQuantity));
            return (
                expected !== null &&
                allocation.length > 0 &&
                amounts.every((amount) => amount !== null && amount > 0n) &&
                amounts.reduce<bigint>((sum, amount) => sum + (amount ?? 0n), 0n) === expected
            );
        });
        if (!complete) {
            setError(t("allocationMismatch"));
            return;
        }
        key.current ??= crypto.randomUUID();
        const parsed = createWorkOrderSchema.safeParse({
            quoteId: quote.id,
            acceptanceId,
            acceptedRevisionId: revision.id,
            expectedQuoteVersion: quote.version,
            expectedRequestVersion: request.version,
            siteId,
            reference: reference.trim(),
            idempotencyKey: key.current,
            items: items.map(({ key: _key, assetName: _name, ...item }) => item),
        });
        if (!parsed.success) {
            setError(t("validationError"));
            return;
        }
        setBusy(true);
        try {
            const order = await submitWorkOrder({ intent: "create", payload: parsed.data });
            router.push(`/${locale}/app/work-orders/${order.id}`);
            router.refresh();
        } catch (cause) {
            if (cause instanceof WorkOrderWebError && cause.status === 409) {
                setConflict(true);
                setError(t("creationConflict"));
            } else if (cause instanceof WorkOrderWebError && cause.status === 403)
                setError(t("forbidden"));
            else setError(t("saveError"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={(event) => void save(event)} className="space-y-6">
            <section
                className="space-y-3 rounded-card border border-border bg-surface p-5"
                aria-labelledby="work-basis-heading"
            >
                <h2 id="work-basis-heading" className="font-display text-xl font-semibold">
                    {t("commercialBasis")}
                </h2>
                <p>
                    {t("acceptedRevision", { number: revision.revisionNumber })} · {quote.reference}
                </p>
                <p className="text-sm text-muted-foreground">{t("basisReadOnly")}</p>
                <ul className="space-y-2">
                    {revision.lines.map((line) => (
                        <li key={line.id} className="rounded-control border border-border p-3">
                            <strong>{line.description}</strong> · {line.quantity} {line.unit}
                        </li>
                    ))}
                </ul>
            </section>
            {error ? (
                <p role="alert" className="rounded-control border border-destructive/30 p-3">
                    {error}
                </p>
            ) : null}
            {conflict ? (
                <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                    {t("reloadLatest")}
                </Button>
            ) : null}
            <fieldset disabled={busy || conflict} className="space-y-6" aria-busy={busy}>
                <legend className="sr-only">{t("newOrder")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="work-order-reference">{t("reference")}</Label>
                        <Input
                            id="work-order-reference"
                            value={reference}
                            maxLength={80}
                            required
                            onChange={(event) => {
                                key.current = null;
                                setReference(event.target.value);
                            }}
                        />
                    </div>
                    <div>
                        <Label htmlFor="work-order-site">{t("site")}</Label>
                        <select
                            id="work-order-site"
                            value={siteId}
                            required
                            onChange={(event) => {
                                key.current = null;
                                setSiteId(event.target.value);
                            }}
                            className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                        >
                            <option value="">{t("chooseSite")}</option>
                            {sites.map((site) => (
                                <option key={site.id} value={site.id}>
                                    {site.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <section className="space-y-4" aria-labelledby="work-allocation-heading">
                    <h2 id="work-allocation-heading" className="font-display text-xl font-semibold">
                        {t("workItems")}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t("allocationHint")}</p>
                    {items.map((item, index) => {
                        const line = revision.lines.find(
                            (candidate) => candidate.id === item.sourceRevisionLineId,
                        )!;
                        return (
                            <fieldset
                                key={item.key}
                                className="space-y-3 rounded-card border border-border bg-surface p-4"
                            >
                                <legend className="px-1 font-semibold">
                                    {t("item", { number: index + 1 })}
                                </legend>
                                <p className="text-sm text-muted-foreground">
                                    {t("fromLine")}: {line.description} · {line.quantity}{" "}
                                    {line.unit}
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <Label htmlFor={`work-scope-${item.key}`}>
                                            {t("operationalScope")}
                                        </Label>
                                        <Input
                                            id={`work-scope-${item.key}`}
                                            value={item.scopeDescription}
                                            maxLength={10000}
                                            required
                                            onChange={(event) =>
                                                updateItem(item.key, {
                                                    scopeDescription: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor={`work-quantity-${item.key}`}>
                                            {t("allocatedQuantity")}
                                        </Label>
                                        <Input
                                            id={`work-quantity-${item.key}`}
                                            inputMode="decimal"
                                            value={item.allocatedQuantity}
                                            required
                                            onChange={(event) =>
                                                updateItem(item.key, {
                                                    allocatedQuantity: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor={`work-asset-requirement-${item.key}`}>
                                        {t("assetRequirement")}
                                    </Label>
                                    <select
                                        id={`work-asset-requirement-${item.key}`}
                                        value={item.assetRequirement}
                                        disabled={Boolean(line.assetId)}
                                        onChange={(event) =>
                                            updateItem(
                                                item.key,
                                                event.target.value === "not_applicable"
                                                    ? {
                                                          assetRequirement: "not_applicable",
                                                          assetId: null,
                                                          assetName: "",
                                                          unresolvedAssetDescription: null,
                                                          serviceMode: "no_intake",
                                                      }
                                                    : { assetRequirement: "required" },
                                            )
                                        }
                                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                                    >
                                        <option value="not_applicable">
                                            {t("assetNotApplicable")}
                                        </option>
                                        <option value="required">{t("assetRequired")}</option>
                                    </select>
                                </div>
                                {item.assetRequirement === "required" ? (
                                    <div className="space-y-3">
                                        {item.assetId ? (
                                            <p>
                                                {t("knownAsset")}: <strong>{item.assetName}</strong>
                                                {!line.assetId ? (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        onClick={() =>
                                                            updateItem(item.key, {
                                                                assetId: null,
                                                                assetName: "",
                                                            })
                                                        }
                                                    >
                                                        {t("removeAsset")}
                                                    </Button>
                                                ) : null}
                                            </p>
                                        ) : null}
                                        {!item.assetId ? (
                                            <div>
                                                <Label htmlFor={`work-unknown-${item.key}`}>
                                                    {t("unresolvedAsset")}
                                                </Label>
                                                <Input
                                                    id={`work-unknown-${item.key}`}
                                                    value={item.unresolvedAssetDescription ?? ""}
                                                    maxLength={10000}
                                                    onChange={(event) =>
                                                        updateItem(item.key, {
                                                            unresolvedAssetDescription:
                                                                event.target.value.trim() || null,
                                                        })
                                                    }
                                                />
                                            </div>
                                        ) : null}
                                        {!line.assetId && canReadAssets ? (
                                            <div>
                                                <Label htmlFor={`work-asset-search-${item.key}`}>
                                                    {t("assetSearch")}
                                                </Label>
                                                <div className="flex flex-wrap gap-2">
                                                    <Input
                                                        id={`work-asset-search-${item.key}`}
                                                        type="search"
                                                        value={assetQuery[item.key] ?? ""}
                                                        maxLength={100}
                                                        className="min-w-48 flex-1"
                                                        onChange={(event) =>
                                                            setAssetQuery((current) => ({
                                                                ...current,
                                                                [item.key]: event.target.value,
                                                            }))
                                                        }
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
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
                                                                        updateItem(item.key, {
                                                                            assetId: asset.id,
                                                                            assetName:
                                                                                asset.displayName,
                                                                            unresolvedAssetDescription:
                                                                                null,
                                                                        });
                                                                        setAssetResults(
                                                                            (current) => ({
                                                                                ...current,
                                                                                [item.key]: [],
                                                                            }),
                                                                        );
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
                                        <div>
                                            <Label htmlFor={`work-mode-${item.key}`}>
                                                {t("serviceMode")}
                                            </Label>
                                            <select
                                                id={`work-mode-${item.key}`}
                                                value={item.serviceMode}
                                                onChange={(event) =>
                                                    updateItem(item.key, {
                                                        serviceMode: event.target
                                                            .value as Allocation["serviceMode"],
                                                    })
                                                }
                                                className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                                            >
                                                <option value="physical_intake">
                                                    {t("physicalIntake")}
                                                </option>
                                                <option value="no_intake">{t("noIntake")}</option>
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {t("noAssetWork")}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => split(item)}
                                        disabled={items.length >= 200}
                                    >
                                        {t("splitItem")}
                                    </Button>
                                    {items.filter(
                                        (candidate) =>
                                            candidate.sourceRevisionLineId ===
                                            item.sourceRevisionLineId,
                                    ).length > 1 ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => {
                                                key.current = null;
                                                setItems((current) =>
                                                    current.filter(
                                                        (candidate) => candidate.key !== item.key,
                                                    ),
                                                );
                                            }}
                                        >
                                            {t("removeItem")}
                                        </Button>
                                    ) : null}
                                </div>
                            </fieldset>
                        );
                    })}
                </section>
                <Button type="submit">{t("createOrder")}</Button>
            </fieldset>
        </form>
    );
}
