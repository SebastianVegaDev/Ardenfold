"use client";

import {
    createReceiptSchema,
    type AssetCurrentRelationships,
    type WorkOrderDetail,
} from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { fetchAssetRelationships } from "@/features/service-management/work-orders/api/browser-client";
import type { Locale } from "@/i18n/locales";

import { submitReceipt, ReceiptWebError } from "../api/browser-client";

type Props = Readonly<{
    locale: Locale;
    order: WorkOrderDetail;
    assets: Record<string, { name: string | null; current: AssetCurrentRelationships | null }>;
    siteName: string;
    canCoordinate: boolean;
}>;

export function ReceiptIntake({ locale, order, assets, siteName, canCoordinate }: Props) {
    const t = useTranslations("receipts");
    const router = useRouter();
    const eligible = order.items.filter(
        (item) => item.serviceMode === "physical_intake" && item.status !== "cancelled",
    );
    const [itemIds, setItemIds] = useState<string[]>([]);
    const [description, setDescription] = useState("");
    const [condition, setCondition] = useState("");
    const [accessories, setAccessories] = useState("");
    const [receivedAt, setReceivedAt] = useState("");
    const [actor, setActor] = useState("");
    const [coordinateCustody, setCoordinateCustody] = useState(canCoordinate);
    const [coordinateLocation, setCoordinateLocation] = useState(canCoordinate);
    const [locationDescription, setLocationDescription] = useState(siteName);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState(false);
    const [createdId, setCreatedId] = useState<string | null>(null);
    const [registry, setRegistry] = useState<AssetCurrentRelationships | null>(null);
    const replay = useRef<{ fingerprint: string; key: string } | null>(null);
    const selected = eligible.filter((item) => itemIds.includes(item.id));
    const knownIds = [
        ...new Set(selected.map((item) => item.assetId).filter((id): id is string => Boolean(id))),
    ];
    const assetId = knownIds.length === 1 ? knownIds[0]! : null;
    if (!eligible.length) return null;

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || conflict || createdId) return;
        setError("");
        if (!itemIds.length || knownIds.length > 1) {
            setError(t("selectCompatibleItems"));
            return;
        }
        const instant = new Date(receivedAt);
        if (!receivedAt || Number.isNaN(instant.valueOf())) {
            setError(t("validationError"));
            return;
        }
        if (coordinateLocation && !locationDescription.trim()) {
            setError(t("validationError"));
            return;
        }
        if (assetId && (coordinateCustody || coordinateLocation) && !assets[assetId]?.current) {
            setError(t("loadError"));
            return;
        }
        const coordination = canCoordinate
            ? {
                  ...(coordinateCustody
                      ? { custody: { subject: "recording_organization" as const } }
                      : {}),
                  ...(coordinateLocation
                      ? {
                            location: {
                                subject: "site" as const,
                                siteId: order.siteId,
                                locationDescription: locationDescription.trim(),
                            },
                        }
                      : {}),
              }
            : {};
        const draft = {
            workOrderId: order.id,
            expectedOrderVersion: order.version,
            itemIds,
            assetId,
            intakeDescription: description.trim(),
            observedCondition: condition.trim(),
            accessories: accessories
                .split("\n")
                .map((value) => value.trim())
                .filter(Boolean),
            receivedAt: instant.toISOString(),
            responsibleActorName: actor.trim(),
            responsiblePartyId: null,
            coordination,
            ...(assetId && (coordinateCustody || coordinateLocation) && assets[assetId]?.current
                ? { expectedAssetVersion: assets[assetId].current.assetVersion }
                : {}),
        };
        const fingerprint = JSON.stringify(draft);
        if (replay.current?.fingerprint !== fingerprint)
            replay.current = { fingerprint, key: crypto.randomUUID() };
        const parsed = createReceiptSchema.safeParse({
            ...draft,
            idempotencyKey: replay.current.key,
        });
        if (!parsed.success) {
            setError(t("validationError"));
            return;
        }
        setBusy(true);
        try {
            const receipt = await submitReceipt({ intent: "create", payload: parsed.data });
            setCreatedId(receipt.id);
            if (receipt.assetId) {
                try {
                    setRegistry(await fetchAssetRelationships(receipt.assetId));
                } catch {
                    setRegistry(null);
                }
            }
            router.refresh();
        } catch (cause) {
            if (cause instanceof ReceiptWebError && cause.status === 409) {
                setConflict(true);
                setError(t("intakeConflict"));
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
            aria-labelledby="receipt-intake-heading"
        >
            <h2 id="receipt-intake-heading" className="font-display text-2xl font-semibold">
                {t("recordIntake")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("intakeHint")}</p>
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
            {createdId ? (
                <div role="status" className="space-y-2 rounded-control border border-border p-3">
                    <p>{t("recorded")}</p>
                    <Link
                        className="text-primary underline"
                        href={`/${locale}/app/receipts/${createdId}`}
                    >
                        {t("viewReceipt")}
                    </Link>
                    {registry ? (
                        <p>
                            {t("registryRefreshed")}: {t("custody")}{" "}
                            {registry.custody?.subject ?? t("notRecorded")}, {t("location")}{" "}
                            {registry.location?.subject ?? t("notRecorded")}
                        </p>
                    ) : null}
                </div>
            ) : null}
            <form onSubmit={(event) => void save(event)} className="space-y-4">
                <fieldset
                    disabled={busy || conflict || Boolean(createdId)}
                    className="space-y-4"
                    aria-busy={busy}
                >
                    <legend className="sr-only">{t("recordIntake")}</legend>
                    <fieldset className="space-y-2">
                        <legend className="font-semibold">{t("selectItems")}</legend>
                        {eligible.map((item) => (
                            <label key={item.id} className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={itemIds.includes(item.id)}
                                    onChange={(event) =>
                                        setItemIds((current) =>
                                            event.target.checked
                                                ? [...current, item.id]
                                                : current.filter((id) => id !== item.id),
                                        )
                                    }
                                />
                                {t("item", { number: item.itemNumber })}: {item.scopeDescription}
                            </label>
                        ))}
                    </fieldset>
                    {knownIds.length > 1 ? <p role="alert">{t("selectCompatibleItems")}</p> : null}
                    <p className="text-sm">
                        {t("asset")}:{" "}
                        {assetId ? (assets[assetId]?.name ?? assetId) : t("assetPending")}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="receipt-description">{t("intakeDescription")}</Label>
                            <Input
                                id="receipt-description"
                                value={description}
                                maxLength={10000}
                                required
                                onChange={(event) => setDescription(event.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="receipt-condition">{t("condition")}</Label>
                            <Input
                                id="receipt-condition"
                                value={condition}
                                maxLength={10000}
                                required
                                onChange={(event) => setCondition(event.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="receipt-actor">{t("responsibleActor")}</Label>
                            <Input
                                id="receipt-actor"
                                value={actor}
                                maxLength={200}
                                required
                                onChange={(event) => setActor(event.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="receipt-date">{t("receivedAt")}</Label>
                            <Input
                                id="receipt-date"
                                type="datetime-local"
                                value={receivedAt}
                                required
                                onChange={(event) => setReceivedAt(event.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="receipt-accessories">{t("accessories")}</Label>
                        <textarea
                            id="receipt-accessories"
                            value={accessories}
                            onChange={(event) => setAccessories(event.target.value)}
                            rows={3}
                            className="mt-2 w-full rounded-control border border-border bg-surface p-3"
                        />
                        <p className="text-xs text-muted-foreground">{t("accessoriesHint")}</p>
                    </div>
                    {canCoordinate ? (
                        <fieldset className="space-y-2">
                            <legend className="font-semibold">{t("registryCoordination")}</legend>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={coordinateCustody}
                                    onChange={(event) => setCoordinateCustody(event.target.checked)}
                                />
                                {t("custodyOrganization")}
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={coordinateLocation}
                                    onChange={(event) =>
                                        setCoordinateLocation(event.target.checked)
                                    }
                                />
                                {t("locationWorkSite")}
                            </label>
                            {coordinateLocation ? (
                                <div>
                                    <Label htmlFor="receipt-location-detail">
                                        {t("locationDetail")}
                                    </Label>
                                    <Input
                                        id="receipt-location-detail"
                                        value={locationDescription}
                                        maxLength={500}
                                        required
                                        onChange={(event) =>
                                            setLocationDescription(event.target.value)
                                        }
                                    />
                                </div>
                            ) : null}
                            <p className="text-sm text-muted-foreground">
                                {t("registryAuthorityHint")}
                            </p>
                        </fieldset>
                    ) : null}
                    <Button type="submit" disabled={!itemIds.length || knownIds.length > 1}>
                        {t("recordIntake")}
                    </Button>
                </fieldset>
            </form>
        </section>
    );
}
