"use client";

import {
    correctReceiptSchema,
    type AssetCurrentRelationships,
    type AssetSummary,
    type ReceiptDetail,
    type WorkOrderDetail,
} from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
    fetchAssetRelationships,
    searchWorkAssets,
} from "@/features/service-management/work-orders/api/browser-client";

import { fetchCurrentReceipt, ReceiptWebError, submitReceipt } from "../api/browser-client";

type Props = Readonly<{
    receipt: ReceiptDetail;
    order: WorkOrderDetail;
    current: AssetCurrentRelationships | null;
    canCoordinate: boolean;
}>;

function localDateTime(value: string): string {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ReceiptCorrectionForm({ receipt, order, current, canCoordinate }: Props) {
    const t = useTranslations("receipts");
    const router = useRouter();
    const [description, setDescription] = useState(receipt.intakeDescription);
    const [condition, setCondition] = useState(receipt.observedCondition);
    const [accessories, setAccessories] = useState(receipt.accessories.join("\n"));
    const [receivedAt, setReceivedAt] = useState(() => localDateTime(receipt.receivedAt));
    const [actor, setActor] = useState(receipt.responsibleActorName);
    const [reason, setReason] = useState("");
    const [assetId, setAssetId] = useState(receipt.assetId);
    const [assetName, setAssetName] = useState("");
    const [assetCurrent, setAssetCurrent] = useState(current);
    const [assetQuery, setAssetQuery] = useState("");
    const [assetResults, setAssetResults] = useState<AssetSummary[]>([]);
    const [custody, setCustody] = useState(Boolean(receipt.coordination.custody));
    const [location, setLocation] = useState(Boolean(receipt.coordination.location));
    const [locationDescription, setLocationDescription] = useState(
        receipt.coordination.location?.locationDescription ?? "",
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState(false);
    const [saved, setSaved] = useState(false);
    const [registry, setRegistry] = useState<AssetCurrentRelationships | null>(null);
    const replay = useRef<{ fingerprint: string; key: string } | null>(null);

    async function findAsset() {
        const query = assetQuery.trim();
        if (query && query.length < 2) return;
        setBusy(true);
        setError("");
        try {
            setAssetResults((await searchWorkAssets(query)).data);
        } catch {
            setError(t("lookupError"));
        } finally {
            setBusy(false);
        }
    }

    async function chooseAsset(asset: AssetSummary) {
        setBusy(true);
        setError("");
        try {
            const relationships = await fetchAssetRelationships(asset.id);
            setAssetId(asset.id);
            setAssetName(asset.displayName);
            setAssetCurrent(relationships);
            setAssetResults([]);
        } catch {
            setError(t("lookupError"));
        } finally {
            setBusy(false);
        }
    }

    async function save(voidReceipt = false) {
        if (busy || conflict || saved) return;
        setError("");
        const instant = new Date(receivedAt);
        if (!receivedAt || Number.isNaN(instant.valueOf())) {
            setError(t("validationError"));
            return;
        }
        if (
            location &&
            (!receipt.coordination.location || receipt.coordination.location.subject === "site") &&
            !locationDescription.trim()
        ) {
            setError(t("validationError"));
            return;
        }
        const changedCoordination =
            custody !== Boolean(receipt.coordination.custody) ||
            location !== Boolean(receipt.coordination.location) ||
            (location &&
                receipt.coordination.location?.subject === "site" &&
                locationDescription.trim() !== receipt.coordination.location.locationDescription);
        const coordination =
            changedCoordination && canCoordinate
                ? {
                      ...(custody
                          ? {
                                custody: receipt.coordination.custody ?? {
                                    subject: "recording_organization" as const,
                                },
                            }
                          : {}),
                      ...(location
                          ? {
                                location: receipt.coordination.location
                                    ? receipt.coordination.location.subject === "site"
                                        ? {
                                              ...receipt.coordination.location,
                                              locationDescription: locationDescription.trim(),
                                          }
                                        : receipt.coordination.location
                                    : {
                                          subject: "site" as const,
                                          siteId: order.siteId,
                                          locationDescription: locationDescription.trim(),
                                      },
                            }
                          : {}),
                  }
                : undefined;
        const draft = {
            expectedVersion: receipt.version,
            expectedOrderVersion: order.version,
            reason: reason.trim(),
            ...(assetId !== receipt.assetId && assetId ? { assetId } : {}),
            intakeDescription: description.trim(),
            observedCondition: condition.trim(),
            accessories: accessories
                .split("\n")
                .map((value) => value.trim())
                .filter(Boolean),
            receivedAt: instant.toISOString(),
            responsibleActorName: actor.trim(),
            ...(coordination ? { coordination } : {}),
            ...(assetCurrent && canCoordinate
                ? { expectedAssetVersion: assetCurrent.assetVersion }
                : {}),
            ...(voidReceipt ? { void: true } : {}),
        };
        const fingerprint = JSON.stringify(draft);
        if (replay.current?.fingerprint !== fingerprint)
            replay.current = { fingerprint, key: crypto.randomUUID() };
        const parsed = correctReceiptSchema.safeParse({
            ...draft,
            idempotencyKey: replay.current.key,
        });
        if (!parsed.success) {
            setError(t("validationError"));
            return;
        }
        setBusy(true);
        try {
            const updated = await submitReceipt({
                intent: "correct",
                receiptId: receipt.id,
                payload: parsed.data,
            });
            setSaved(true);
            if (updated.assetId) {
                try {
                    setRegistry(await fetchAssetRelationships(updated.assetId));
                } catch {
                    setRegistry(null);
                }
            }
            router.refresh();
        } catch (cause) {
            if (cause instanceof ReceiptWebError && cause.status === 409) {
                try {
                    await fetchCurrentReceipt(receipt.id);
                } catch {
                    /* Reload remains available. */
                }
                setConflict(true);
                setError(t("correctionConflict"));
            } else if (cause instanceof ReceiptWebError && cause.status === 403)
                setError(t("forbidden"));
            else setError(t("saveError"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section
            className="space-y-4 rounded-card border border-border bg-surface p-5"
            aria-labelledby="receipt-correction-heading"
        >
            <h2 id="receipt-correction-heading" className="font-display text-xl font-semibold">
                {t("correctReceipt")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("correctionHint")}</p>
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
            {saved ? (
                <div role="status" className="space-y-2">
                    <p>{t("corrected")}</p>
                    {registry ? (
                        <p>
                            {t("registryRefreshed")}: {t("custody")}{" "}
                            {registry.custody?.subject ?? t("notRecorded")}, {t("location")}{" "}
                            {registry.location?.subject ?? t("notRecorded")}
                        </p>
                    ) : null}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => window.location.reload()}
                    >
                        {t("reloadLatest")}
                    </Button>
                </div>
            ) : null}
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
                className="space-y-4"
            >
                <fieldset
                    disabled={busy || conflict || saved}
                    className="space-y-4"
                    aria-busy={busy}
                >
                    <legend className="sr-only">{t("correctReceipt")}</legend>
                    <div>
                        <Label htmlFor="receipt-correction-reason">{t("reason")}</Label>
                        <Input
                            id="receipt-correction-reason"
                            value={reason}
                            maxLength={10000}
                            required
                            onChange={(event) => setReason(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="receipt-correction-description">
                                {t("intakeDescription")}
                            </Label>
                            <Input
                                id="receipt-correction-description"
                                value={description}
                                maxLength={10000}
                                required
                                onChange={(event) => setDescription(event.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="receipt-correction-condition">{t("condition")}</Label>
                            <Input
                                id="receipt-correction-condition"
                                value={condition}
                                maxLength={10000}
                                required
                                onChange={(event) => setCondition(event.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="receipt-correction-actor">
                                {t("responsibleActor")}
                            </Label>
                            <Input
                                id="receipt-correction-actor"
                                value={actor}
                                maxLength={200}
                                required
                                onChange={(event) => setActor(event.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="receipt-correction-date">{t("receivedAt")}</Label>
                            <Input
                                id="receipt-correction-date"
                                type="datetime-local"
                                value={receivedAt}
                                required
                                onChange={(event) => setReceivedAt(event.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="receipt-correction-accessories">{t("accessories")}</Label>
                        <textarea
                            id="receipt-correction-accessories"
                            value={accessories}
                            onChange={(event) => setAccessories(event.target.value)}
                            rows={3}
                            className="mt-2 w-full rounded-control border border-border bg-surface p-3"
                        />
                    </div>
                    {!receipt.assetId ? (
                        <div className="space-y-2">
                            <p>
                                {t("asset")}: {assetId ? assetName : t("assetPending")}
                            </p>
                            <Label htmlFor="receipt-asset-search">{t("assetSearch")}</Label>
                            <div className="flex flex-wrap gap-2">
                                <Input
                                    id="receipt-asset-search"
                                    value={assetQuery}
                                    type="search"
                                    maxLength={100}
                                    className="min-w-48 flex-1"
                                    onChange={(event) => setAssetQuery(event.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
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
                                                onClick={() => void chooseAsset(asset)}
                                            >
                                                {asset.displayName}
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    ) : null}
                    {canCoordinate ? (
                        <fieldset className="space-y-2">
                            <legend className="font-semibold">{t("registryCoordination")}</legend>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={custody}
                                    onChange={(event) => setCustody(event.target.checked)}
                                />
                                {t("coordinateCustody")}
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={location}
                                    onChange={(event) => setLocation(event.target.checked)}
                                />
                                {t("coordinateLocation")}
                            </label>
                            {location &&
                            (!receipt.coordination.location ||
                                receipt.coordination.location.subject === "site") ? (
                                <div>
                                    <Label htmlFor="receipt-correction-location">
                                        {t("locationDetail")}
                                    </Label>
                                    <Input
                                        id="receipt-correction-location"
                                        value={locationDescription}
                                        maxLength={500}
                                        required
                                        onChange={(event) =>
                                            setLocationDescription(event.target.value)
                                        }
                                    />
                                </div>
                            ) : null}
                        </fieldset>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                        <Button type="submit">{t("saveCorrection")}</Button>
                        {receipt.custodyStatus !== "applied" || canCoordinate ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    if (reason.trim()) void save(true);
                                    else setError(t("reasonRequired"));
                                }}
                            >
                                {t("voidReceipt")}
                            </Button>
                        ) : null}
                    </div>
                </fieldset>
            </form>
        </section>
    );
}
