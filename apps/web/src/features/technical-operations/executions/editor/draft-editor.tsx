"use client";

import {
    editExecutionDraftSchema,
    type AssetSummary,
    type OrganizationSite,
} from "@ardenfold/contracts";
import { useState, type FormEvent } from "react";

import { searchWorkAssets } from "@/features/service-management/work-orders/api/browser-client";

import { technicalRequest } from "../../api/technical-client";
import type { Condition, Execution, Revision, SupportingAsset } from "../../api/technical-client";

type Copy = Record<string, string>;

function dateInput(value: string | null): string {
    return value ? new Date(value).toISOString().slice(0, 16) : "";
}

export function DraftEditor({
    execution,
    revision,
    conditions,
    supportingAssets,
    currentUserId,
    sites,
    copy,
    onSaved,
    onError,
}: {
    execution: Execution;
    revision: Revision;
    conditions: Condition[];
    supportingAssets: SupportingAsset[];
    currentUserId: string;
    sites: OrganizationSite[];
    copy: Copy;
    onSaved: () => Promise<void>;
    onError: (error: unknown) => void;
}) {
    const [methodName, setMethodName] = useState(revision.methodName ?? "");
    const [methodIdentifier, setMethodIdentifier] = useState(revision.methodIdentifier ?? "");
    const [methodVersion, setMethodVersion] = useState(revision.methodVersion ?? "");
    const [startedAt, setStartedAt] = useState(dateInput(revision.performedStartedAt));
    const [endedAt, setEndedAt] = useState(dateInput(revision.performedEndedAt));
    const [location, setLocation] = useState(revision.performedLocationSnapshot ?? "");
    const [siteId, setSiteId] = useState(revision.performedAtSiteId ?? execution.siteIdAtStart);
    const [notes, setNotes] = useState(revision.technicianNotes ?? "");
    const [performer, setPerformer] = useState(revision.performerUserId ?? "");
    const [items, setItems] = useState(
        conditions.map((condition) => ({
            name: condition.name,
            decimalValue: condition.decimalValue ?? "",
            unitCode: condition.unitCode ?? "",
            textValue: condition.textValue ?? "",
        })),
    );
    const [assets, setAssets] = useState(
        supportingAssets.map((asset) => ({ assetId: asset.assetId, use: asset.use })),
    );
    const [assetQuery, setAssetQuery] = useState("");
    const [matches, setMatches] = useState<AssetSummary[]>([]);
    const [validation, setValidation] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const payload = editExecutionDraftSchema.safeParse({
            expectedVersion: revision.version,
            performerUserId: performer || null,
            methodName: methodName.trim() || null,
            methodIdentifier: methodIdentifier.trim() || null,
            methodVersion: methodVersion.trim() || null,
            performedStartedAt: startedAt ? new Date(startedAt).toISOString() : null,
            performedEndedAt: endedAt ? new Date(endedAt).toISOString() : null,
            performedAtSiteId: siteId || null,
            performedLocationSnapshot: location.trim() || null,
            technicianNotes: notes.trim() || null,
            conditions: items.map((item, index) => ({
                position: index + 1,
                name: item.name,
                ...(item.decimalValue
                    ? { decimalValue: item.decimalValue, unitCode: item.unitCode }
                    : { textValue: item.textValue }),
            })),
            supportingAssets: assets.map((asset, index) => ({ ...asset, position: index + 1 })),
        });
        if (!payload.success) {
            setValidation(payload.error.issues[0]?.message ?? copy.invalid ?? "Invalid draft");
            return;
        }
        setValidation(null);
        setBusy(true);
        try {
            await technicalRequest(
                `technical-executions/${execution.id}/revisions/${revision.id}`,
                { method: "PATCH", body: payload.data },
            );
            await onSaved();
        } catch (error) {
            onError(error);
        } finally {
            setBusy(false);
        }
    }

    const input = "mt-1 w-full rounded-control border border-border bg-surface px-3 py-2";
    async function searchAssets() {
        if (assetQuery.trim().length < 2) return;
        try {
            setMatches((await searchWorkAssets(assetQuery.trim())).data);
        } catch (error) {
            onError(error);
        }
    }
    return (
        <form
            onSubmit={(event) => void save(event)}
            className="space-y-5 rounded-control border border-border p-5"
        >
            <h2 className="text-xl font-semibold">{copy.context}</h2>
            <label className="block text-sm font-medium">
                {copy.performer}
                <select
                    value={performer}
                    onChange={(event) => setPerformer(event.target.value)}
                    className={input}
                >
                    <option value="">{copy.unassigned}</option>
                    {revision.performerUserId && revision.performerUserId !== currentUserId && (
                        <option value={revision.performerUserId}>
                            {revision.performerNameSnapshot ?? revision.performerUserId}
                        </option>
                    )}
                    <option value={currentUserId}>{copy.me}</option>
                </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium">
                    {copy.method}
                    <input
                        value={methodName}
                        onChange={(event) => setMethodName(event.target.value)}
                        className={input}
                        maxLength={240}
                    />
                </label>
                <label className="block text-sm font-medium">
                    {copy.methodIdentifier}
                    <input
                        value={methodIdentifier}
                        onChange={(event) => setMethodIdentifier(event.target.value)}
                        className={input}
                        maxLength={120}
                    />
                </label>
                <label className="block text-sm font-medium">
                    {copy.methodVersion}
                    <input
                        value={methodVersion}
                        onChange={(event) => setMethodVersion(event.target.value)}
                        className={input}
                        maxLength={120}
                    />
                </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                    {copy.startedAt}
                    <input
                        type="datetime-local"
                        value={startedAt}
                        onChange={(event) => setStartedAt(event.target.value)}
                        className={input}
                    />
                </label>
                <label className="block text-sm font-medium">
                    {copy.endedAt}
                    <input
                        type="datetime-local"
                        value={endedAt}
                        onChange={(event) => setEndedAt(event.target.value)}
                        className={input}
                    />
                </label>
            </div>
            <label className="block text-sm font-medium">
                {copy.site}
                <select
                    value={siteId}
                    onChange={(event) => setSiteId(event.target.value)}
                    className={input}
                >
                    {!sites.some((site) => site.id === siteId) && (
                        <option value={siteId}>{execution.siteNameAtStart}</option>
                    )}
                    {sites
                        .filter((site) => site.isActive || site.id === siteId)
                        .map((site) => (
                            <option key={site.id} value={site.id}>
                                {site.name}
                            </option>
                        ))}
                </select>
            </label>
            <label className="block text-sm font-medium">
                {copy.location}
                <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    className={input}
                    maxLength={240}
                />
            </label>
            <label className="block text-sm font-medium">
                {copy.notes}
                <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={input}
                    maxLength={4000}
                    rows={3}
                />
            </label>
            <div className="space-y-3">
                <h3 className="font-semibold">{copy.conditions}</h3>
                {items.map((item, index) => (
                    <div
                        key={index}
                        className="grid gap-2 rounded-control bg-surface-muted p-3 sm:grid-cols-4"
                    >
                        <label className="text-sm">
                            {copy.name}
                            <input
                                value={item.name}
                                onChange={(event) =>
                                    setItems((current) =>
                                        current.map((value, position) =>
                                            position === index
                                                ? { ...value, name: event.target.value }
                                                : value,
                                        ),
                                    )
                                }
                                className={input}
                            />
                        </label>
                        <label className="text-sm">
                            {copy.decimalValue}
                            <input
                                inputMode="decimal"
                                value={item.decimalValue}
                                onChange={(event) =>
                                    setItems((current) =>
                                        current.map((value, position) =>
                                            position === index
                                                ? {
                                                      ...value,
                                                      decimalValue: event.target.value,
                                                      textValue: "",
                                                  }
                                                : value,
                                        ),
                                    )
                                }
                                className={input}
                            />
                        </label>
                        <label className="text-sm">
                            {copy.unit}
                            <input
                                value={item.unitCode}
                                onChange={(event) =>
                                    setItems((current) =>
                                        current.map((value, position) =>
                                            position === index
                                                ? { ...value, unitCode: event.target.value }
                                                : value,
                                        ),
                                    )
                                }
                                className={input}
                            />
                        </label>
                        <label className="text-sm">
                            {copy.textValue}
                            <input
                                value={item.textValue}
                                onChange={(event) =>
                                    setItems((current) =>
                                        current.map((value, position) =>
                                            position === index
                                                ? {
                                                      ...value,
                                                      textValue: event.target.value,
                                                      decimalValue: "",
                                                      unitCode: "",
                                                  }
                                                : value,
                                        ),
                                    )
                                }
                                className={input}
                            />
                        </label>
                        <button
                            type="button"
                            className="text-left text-sm text-destructive underline"
                            onClick={() =>
                                setItems((current) =>
                                    current.filter((_, position) => position !== index),
                                )
                            }
                        >
                            {copy.remove}
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="text-primary underline"
                    onClick={() =>
                        setItems((current) => [
                            ...current,
                            { name: "", decimalValue: "", unitCode: "", textValue: "" },
                        ])
                    }
                >
                    {copy.addCondition}
                </button>
            </div>
            <div className="space-y-3">
                <h3 className="font-semibold">{copy.supportingAssets}</h3>
                <div className="flex flex-wrap items-end gap-2">
                    <label className="text-sm">
                        {copy.assetSearch}
                        <input
                            value={assetQuery}
                            onChange={(event) => setAssetQuery(event.target.value)}
                            className={input}
                        />
                    </label>
                    <button
                        type="button"
                        className="rounded-control border border-border px-3 py-2"
                        onClick={() => void searchAssets()}
                    >
                        {copy.search}
                    </button>
                </div>
                {matches.length > 0 && (
                    <ul className="space-y-1">
                        {matches.map((match) => (
                            <li key={match.id}>
                                <button
                                    type="button"
                                    className="text-primary underline"
                                    onClick={() => {
                                        setAssets((current) =>
                                            current.some((asset) => asset.assetId === match.id)
                                                ? current
                                                : [...current, { assetId: match.id, use: "" }],
                                        );
                                        setMatches([]);
                                        setAssetQuery("");
                                    }}
                                >
                                    {match.displayName}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {assets.map((asset, index) => (
                    <div key={index} className="flex flex-wrap gap-2">
                        <label className="text-sm">
                            {copy.assetId}
                            <input value={asset.assetId} readOnly className={input} />
                        </label>
                        <label className="text-sm">
                            {copy.assetUse}
                            <input
                                value={asset.use}
                                onChange={(event) =>
                                    setAssets((current) =>
                                        current.map((value, position) =>
                                            position === index
                                                ? { ...value, use: event.target.value }
                                                : value,
                                        ),
                                    )
                                }
                                className={input}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() =>
                                setAssets((current) =>
                                    current.filter((_, position) => position !== index),
                                )
                            }
                        >
                            {copy.remove}
                        </button>
                    </div>
                ))}
            </div>
            {validation && (
                <p role="alert" className="text-destructive">
                    {validation}
                </p>
            )}
            <button
                disabled={busy}
                type="submit"
                className="rounded-control bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
                {copy.save}
            </button>
        </form>
    );
}
