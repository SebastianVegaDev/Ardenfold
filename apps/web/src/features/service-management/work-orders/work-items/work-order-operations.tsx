"use client";

import {
    updateWorkOrderSchema,
    workItemReadinessBlockerSchema,
    workOrderTransitionSchema,
    type AssetCurrentRelationships,
    type OrganizationSite,
    type WorkOrderDetail,
    type WorkOrderReadinessResponse,
} from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { Locale } from "@/i18n/locales";

import { fetchCurrentWorkOrder, submitWorkOrder, WorkOrderWebError } from "../api/browser-client";
import { WorkItemCard } from "./work-item-card";

type Props = Readonly<{
    locale: Locale;
    order: WorkOrderDetail;
    assets: Record<string, { name: string | null; current: AssetCurrentRelationships | null }>;
    sites: OrganizationSite[];
    readiness: WorkOrderReadinessResponse["data"] | null;
    fixedAssets: Record<string, string | null>;
    canWrite: boolean;
    canReadAssets: boolean;
}>;

export function WorkOrderOperations({
    locale,
    order,
    assets,
    sites,
    readiness,
    fixedAssets,
    canWrite,
    canReadAssets,
}: Props) {
    const t = useTranslations("workOrders");
    const router = useRouter();
    const [current, setCurrent] = useState(order);
    const [latest, setLatest] = useState<WorkOrderDetail | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [reason, setReason] = useState("");
    const [siteId, setSiteId] = useState(order.siteId);
    const [notes, setNotes] = useState(order.preparationNotes ?? "");
    useEffect(() => {
        setCurrent(order);
        setSiteId(order.siteId);
        setNotes(order.preparationNotes ?? "");
    }, [order]);

    async function run(intent: string, payload: unknown, itemId?: string) {
        if (busy || latest) return;
        setError("");
        setBusy(true);
        try {
            const updated = await submitWorkOrder({
                intent,
                orderId: current.id,
                ...(itemId ? { itemId } : {}),
                payload,
            });
            setCurrent(updated);
            setReason("");
            router.refresh();
        } catch (cause) {
            if (cause instanceof WorkOrderWebError && cause.status === 409) {
                if (cause.code === "VERSION_CONFLICT") {
                    try {
                        setLatest(await fetchCurrentWorkOrder(current.id));
                    } catch {
                        setError(t("loadError"));
                    }
                    setError(t("versionConflict"));
                } else if (workItemReadinessBlockerSchema.safeParse(cause.code).success) {
                    const blocker = workItemReadinessBlockerSchema.parse(cause.code);
                    setError(t(`readiness.${blocker}`));
                    router.refresh();
                } else setError(t("actionUnavailable"));
            } else if (cause instanceof WorkOrderWebError && cause.status === 403)
                setError(t("forbidden"));
            else setError(t("saveError"));
        } finally {
            setBusy(false);
        }
    }

    function transition(intent: "ready" | "planned" | "cancel") {
        const input = workOrderTransitionSchema.safeParse({
            expectedVersion: current.version,
            reason: reason.trim(),
        });
        if (!input.success) {
            setError(t("reasonRequired"));
            return;
        }
        void run(intent, input.data);
    }

    function update() {
        const input = updateWorkOrderSchema.safeParse({
            expectedVersion: current.version,
            reason: reason.trim(),
            siteId,
            preparationNotes: notes.trim() || null,
        });
        if (!input.success) {
            setError(t("validationError"));
            return;
        }
        void run("update", input.data);
    }

    return (
        <section className="space-y-5" aria-labelledby="work-items-heading">
            <h2 id="work-items-heading" className="font-display text-2xl font-semibold">
                {t("workItems")}
            </h2>
            {error ? (
                <p role="alert" className="rounded-control border border-destructive/30 p-3">
                    {error}
                </p>
            ) : null}
            {latest ? (
                <div
                    role="status"
                    className="space-y-2 rounded-control border border-border bg-surface p-4"
                >
                    <p>{t("latestVersion", { version: latest.version })}</p>
                    <p>{t("conflictReviewHint")}</p>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            setCurrent(latest);
                            setLatest(null);
                            setError("");
                            router.refresh();
                        }}
                    >
                        {t("loadLatest")}
                    </Button>
                </div>
            ) : null}
            {canWrite && current.status !== "cancelled" ? (
                <fieldset
                    disabled={busy || Boolean(latest)}
                    className="space-y-4 rounded-card border border-border bg-surface p-5"
                    aria-busy={busy}
                >
                    <legend className="px-1 font-semibold">{t("preparation")}</legend>
                    <div>
                        <Label htmlFor="work-change-reason">{t("reason")}</Label>
                        <Input
                            id="work-change-reason"
                            value={reason}
                            maxLength={10000}
                            onChange={(event) => setReason(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="work-site-edit">{t("site")}</Label>
                            <select
                                id="work-site-edit"
                                value={siteId}
                                onChange={(event) => setSiteId(event.target.value)}
                                className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                            >
                                {sites.map((site) => (
                                    <option key={site.id} value={site.id}>
                                        {site.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="work-notes">{t("preparationNotes")}</Label>
                            <Input
                                id="work-notes"
                                value={notes}
                                maxLength={10000}
                                onChange={(event) => setNotes(event.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={update}>
                            {t("savePreparation")}
                        </Button>
                        {current.status === "planned" ? (
                            <Button type="button" onClick={() => transition("ready")}>
                                {t("markOrderReady")}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => transition("planned")}
                            >
                                {t("returnToPlanned")}
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => transition("cancel")}
                        >
                            {t("cancelOrder")}
                        </Button>
                    </div>
                </fieldset>
            ) : null}
            <ol className="grid gap-4">
                {current.items.map((item) => (
                    <li key={`${item.id}:${item.version}`}>
                        <WorkItemCard
                            locale={locale}
                            order={current}
                            item={item}
                            assetName={item.assetId ? (assets[item.assetId]?.name ?? null) : null}
                            blocker={
                                readiness?.find((entry) => entry.itemId === item.id)?.blocker ??
                                null
                            }
                            readinessAvailable={Boolean(readiness)}
                            canWrite={
                                canWrite && !busy && !latest && current.status !== "cancelled"
                            }
                            canReadAssets={canReadAssets}
                            fixedAssetId={fixedAssets[item.sourceRevisionLineId] ?? null}
                            reason={reason}
                            onAction={run}
                        />
                    </li>
                ))}
            </ol>
        </section>
    );
}
