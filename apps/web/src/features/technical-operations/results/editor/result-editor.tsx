"use client";

import {
    createTechnicalResultGroupSchema,
    createTechnicalResultSchema,
    technicalResultValueSchema,
    updateTechnicalResultSchema,
    type TechnicalResultValue,
} from "@ardenfold/contracts";
import { useState, type FormEvent } from "react";

import {
    technicalRequest,
    type Execution,
    type GroupRow,
    type ResultRow,
    type Revision,
} from "../../api/technical-client";

type Copy = Record<string, string>;
type Kind = TechnicalResultValue["kind"];
type Fields = Record<string, string>;
const detailKeys = [
    "decimalValueText",
    "unitCode",
    "resolutionText",
    "significantDigits",
    "uncertaintyText",
    "uncertaintyUnitCode",
    "uncertaintyCoverage",
    "toleranceLowerText",
    "toleranceUpperText",
    "toleranceUnitCode",
    "toleranceRule",
    "categoryCode",
    "categoryLabel",
    "categoryMeaningSnapshot",
    "textValue",
    "textLanguage",
    "missingExplanation",
    "conformityRule",
] as const;

function fieldsFrom(row?: ResultRow): Fields {
    return Object.fromEntries(detailKeys.map((key) => [key, row?.[key]?.toString() ?? ""]));
}

function valueFrom(
    fields: Fields,
    kind: Kind,
    common: {
        groupId: string | null;
        position: number;
        characteristic: string;
        contextNote: string | null;
        conformity: "conforms" | "does_not_conform" | "undetermined" | null;
        missingReason: "not_observed" | "not_applicable" | "unavailable";
    },
) {
    const optional = (name: string) => fields[name]?.trim() || null;
    const base = {
        groupId: common.groupId,
        position: common.position,
        characteristic: common.characteristic,
        contextNote: common.contextNote,
    };
    if (kind === "quantitative")
        return {
            ...base,
            kind,
            decimalValueText: fields.decimalValueText,
            unitCode: fields.unitCode,
            resolutionText: optional("resolutionText"),
            significantDigits: optional("significantDigits")
                ? Number(fields.significantDigits)
                : null,
            uncertaintyText: optional("uncertaintyText"),
            uncertaintyUnitCode: optional("uncertaintyUnitCode"),
            uncertaintyCoverage: optional("uncertaintyCoverage"),
            toleranceLowerText: optional("toleranceLowerText"),
            toleranceUpperText: optional("toleranceUpperText"),
            toleranceUnitCode: optional("toleranceUnitCode"),
            toleranceRule: optional("toleranceRule"),
            conformity: common.conformity,
            conformityRule: optional("conformityRule"),
        };
    if (kind === "categorical")
        return {
            ...base,
            kind,
            categoryCode: fields.categoryCode,
            categoryLabel: fields.categoryLabel,
            categoryMeaningSnapshot: fields.categoryMeaningSnapshot,
            conformity: common.conformity,
            conformityRule: optional("conformityRule"),
        };
    if (kind === "textual")
        return {
            ...base,
            kind,
            textValue: fields.textValue,
            textLanguage: optional("textLanguage"),
            conformity: common.conformity,
            conformityRule: optional("conformityRule"),
        };
    return {
        ...base,
        kind,
        missingReason: common.missingReason,
        missingExplanation: optional("missingExplanation"),
    };
}

export function ResultEditor({
    execution,
    revision,
    groups,
    results,
    copy,
    onSaved,
    onError,
}: {
    execution: Execution;
    revision: Revision;
    groups: GroupRow[];
    results: ResultRow[];
    copy: Copy;
    onSaved: () => Promise<void>;
    onError: (error: unknown) => void;
}) {
    const [editing, setEditing] = useState<ResultRow | null>(null);
    const [kind, setKind] = useState<Kind>("quantitative");
    const [groupId, setGroupId] = useState("");
    const [characteristic, setCharacteristic] = useState("");
    const [contextNote, setContextNote] = useState("");
    const [conformity, setConformity] = useState("");
    const [missingReason, setMissingReason] = useState<
        "not_observed" | "not_applicable" | "unavailable"
    >("not_observed");
    const [fields, setFields] = useState<Fields>(() => fieldsFrom());
    const [groupLabel, setGroupLabel] = useState("");
    const [validation, setValidation] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const base = `technical-executions/${execution.id}/revisions/${revision.id}`;
    const input = "mt-1 w-full rounded-control border border-border bg-surface px-3 py-2";
    const nextPosition =
        Math.max(
            0,
            ...results
                .filter((row) => row.groupId === (groupId || null))
                .map((row) => row.position),
        ) + 1;

    function select(row: ResultRow) {
        setEditing(row);
        setKind(row.kind);
        setGroupId(row.groupId ?? "");
        setCharacteristic(row.characteristic);
        setContextNote(row.contextNote ?? "");
        setConformity(row.conformity ?? "");
        setMissingReason(row.missingReason ?? "not_observed");
        setFields(fieldsFrom(row));
        setValidation(null);
    }
    function reset() {
        setEditing(null);
        setKind("quantitative");
        setGroupId("");
        setCharacteristic("");
        setContextNote("");
        setConformity("");
        setFields(fieldsFrom());
        setValidation(null);
    }
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = technicalResultValueSchema.safeParse(
            valueFrom(fields, kind, {
                groupId: groupId || null,
                position: editing?.groupId === (groupId || null) ? editing.position : nextPosition,
                characteristic,
                contextNote: contextNote.trim() || null,
                conformity: conformity
                    ? (conformity as "conforms" | "does_not_conform" | "undetermined")
                    : null,
                missingReason,
            }),
        );
        if (!value.success) {
            setValidation(value.error.issues[0]?.message ?? copy.invalid ?? "Invalid result");
            return;
        }
        const payload = editing
            ? updateTechnicalResultSchema.safeParse({
                  expectedRevisionVersion: revision.version,
                  expectedResultVersion: editing.version,
                  value: value.data,
              })
            : createTechnicalResultSchema.safeParse({
                  expectedRevisionVersion: revision.version,
                  value: value.data,
              });
        if (!payload.success) {
            setValidation(payload.error.issues[0]?.message ?? copy.invalid ?? "Invalid result");
            return;
        }
        setBusy(true);
        setValidation(null);
        try {
            await technicalRequest(`${base}/results${editing ? `/${editing.id}` : ""}`, {
                method: editing ? "PATCH" : "POST",
                body: payload.data,
            });
            reset();
            await onSaved();
        } catch (error) {
            onError(error);
        } finally {
            setBusy(false);
        }
    }
    async function createGroup(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const payload = createTechnicalResultGroupSchema.safeParse({
            expectedRevisionVersion: revision.version,
            position: Math.max(0, ...groups.map((group) => group.position)) + 1,
            label: groupLabel,
        });
        if (!payload.success) {
            setValidation(payload.error.issues[0]?.message ?? copy.invalid ?? "Invalid group");
            return;
        }
        setBusy(true);
        try {
            await technicalRequest(`${base}/result-groups`, { method: "POST", body: payload.data });
            setGroupLabel("");
            await onSaved();
        } catch (error) {
            onError(error);
        } finally {
            setBusy(false);
        }
    }
    async function remove(row: ResultRow) {
        setBusy(true);
        try {
            await technicalRequest(`${base}/results/${row.id}/remove`, {
                method: "POST",
                body: {
                    expectedRevisionVersion: revision.version,
                    expectedResultVersion: row.version,
                },
            });
            await onSaved();
        } catch (error) {
            onError(error);
        } finally {
            setBusy(false);
        }
    }
    async function move(row: ResultRow, direction: -1 | 1) {
        const siblings = results
            .filter((item) => item.groupId === row.groupId)
            .sort((a, b) => a.position - b.position);
        const index = siblings.findIndex((item) => item.id === row.id);
        if (index + direction < 0 || index + direction >= siblings.length) return;
        const orderedIds = siblings.map((item) => item.id);
        [orderedIds[index], orderedIds[index + direction]] = [
            orderedIds[index + direction]!,
            orderedIds[index]!,
        ];
        setBusy(true);
        try {
            await technicalRequest(`${base}/results/reorder`, {
                method: "POST",
                body: {
                    expectedRevisionVersion: revision.version,
                    groupId: row.groupId,
                    orderedIds,
                },
            });
            await onSaved();
        } catch (error) {
            onError(error);
        } finally {
            setBusy(false);
        }
    }
    const field = (name: (typeof detailKeys)[number], mode?: string) => (
        <label key={name} className="block text-sm font-medium">
            {copy[name]}
            <input
                inputMode={mode === "decimal" ? "decimal" : undefined}
                value={fields[name] ?? ""}
                onChange={(event) =>
                    setFields((value) => ({ ...value, [name]: event.target.value }))
                }
                className={input}
            />
        </label>
    );
    return (
        <section className="space-y-5 rounded-control border border-border p-5">
            <h2 className="text-xl font-semibold">{copy.results}</h2>
            <div className="space-y-3">
                {groups.map((group) => (
                    <h3 key={group.id} className="font-medium">
                        {group.position}. {group.label}
                    </h3>
                ))}
                {results.length === 0 && <p className="text-muted-foreground">{copy.noResults}</p>}
                {results.map((row) => (
                    <article key={row.id} className="rounded-control bg-surface-muted p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <strong>{row.characteristic}</strong>
                                <p className="text-sm">
                                    {row.kind === "quantitative"
                                        ? `${row.decimalValueText} ${row.unitCode}`
                                        : row.kind === "categorical"
                                          ? row.categoryLabel
                                          : row.kind === "textual"
                                            ? row.textValue
                                            : `${copy.missing}: ${copy[row.missingReason ?? "not_observed"]}`}
                                </p>
                                {row.contextNote && (
                                    <p className="text-sm text-muted-foreground">
                                        {row.contextNote}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    disabled={busy}
                                    type="button"
                                    className="underline"
                                    onClick={() => select(row)}
                                >
                                    {copy.edit}
                                </button>
                                <button
                                    disabled={busy}
                                    type="button"
                                    aria-label={`${copy.up} ${row.characteristic}`}
                                    onClick={() => void move(row, -1)}
                                >
                                    ↑
                                </button>
                                <button
                                    disabled={busy}
                                    type="button"
                                    aria-label={`${copy.down} ${row.characteristic}`}
                                    onClick={() => void move(row, 1)}
                                >
                                    ↓
                                </button>
                                <button
                                    disabled={busy}
                                    type="button"
                                    className="text-destructive underline"
                                    onClick={() => void remove(row)}
                                >
                                    {copy.remove}
                                </button>
                            </div>
                        </div>
                    </article>
                ))}
            </div>
            <form
                onSubmit={(event) => void createGroup(event)}
                className="flex flex-wrap items-end gap-2"
            >
                <label className="text-sm">
                    {copy.group}
                    <input
                        value={groupLabel}
                        onChange={(event) => setGroupLabel(event.target.value)}
                        className={input}
                    />
                </label>
                <button
                    disabled={busy}
                    type="submit"
                    className="rounded-control border border-border px-3 py-2"
                >
                    {copy.addGroup}
                </button>
            </form>
            <form
                onSubmit={(event) => void save(event)}
                className="space-y-4 border-t border-border pt-5"
            >
                <h3 className="font-semibold">{editing ? copy.editResult : copy.addResult}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                        {copy.kind}
                        <select
                            value={kind}
                            onChange={(event) => setKind(event.target.value as Kind)}
                            className={input}
                        >
                            <option value="quantitative">{copy.quantitative}</option>
                            <option value="categorical">{copy.categorical}</option>
                            <option value="textual">{copy.textual}</option>
                            <option value="missing">{copy.missing}</option>
                        </select>
                    </label>
                    <label className="text-sm">
                        {copy.group}
                        <select
                            value={groupId}
                            onChange={(event) => setGroupId(event.target.value)}
                            className={input}
                        >
                            <option value="">{copy.ungrouped}</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>
                                    {group.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                        {copy.characteristic}
                        <input
                            required
                            value={characteristic}
                            onChange={(event) => setCharacteristic(event.target.value)}
                            className={input}
                        />
                    </label>
                    <label className="text-sm">
                        {copy.contextNote}
                        <input
                            value={contextNote}
                            onChange={(event) => setContextNote(event.target.value)}
                            className={input}
                        />
                    </label>
                </div>
                {kind === "quantitative" && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {field("decimalValueText", "decimal")}
                        {field("unitCode")}
                        {field("resolutionText", "decimal")}
                        {field("significantDigits")}
                        {field("uncertaintyText", "decimal")}
                        {field("uncertaintyUnitCode")}
                        {field("uncertaintyCoverage")}
                        {field("toleranceLowerText", "decimal")}
                        {field("toleranceUpperText", "decimal")}
                        {field("toleranceUnitCode")}
                        {field("toleranceRule")}
                    </div>
                )}
                {kind === "categorical" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {field("categoryCode")}
                        {field("categoryLabel")}
                        {field("categoryMeaningSnapshot")}
                    </div>
                )}
                {kind === "textual" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {field("textValue")}
                        {field("textLanguage")}
                    </div>
                )}
                {kind === "missing" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm">
                            {copy.missingReason}
                            <select
                                value={missingReason}
                                onChange={(event) =>
                                    setMissingReason(event.target.value as typeof missingReason)
                                }
                                className={input}
                            >
                                <option value="not_observed">{copy.not_observed}</option>
                                <option value="not_applicable">{copy.not_applicable}</option>
                                <option value="unavailable">{copy.unavailable}</option>
                            </select>
                        </label>
                        {field("missingExplanation")}
                    </div>
                )}
                {kind !== "missing" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm">
                            {copy.conformity}
                            <select
                                value={conformity}
                                onChange={(event) => setConformity(event.target.value)}
                                className={input}
                            >
                                <option value="">—</option>
                                <option value="conforms">{copy.conforms}</option>
                                <option value="does_not_conform">{copy.does_not_conform}</option>
                                <option value="undetermined">{copy.undetermined}</option>
                            </select>
                        </label>
                        {field("conformityRule")}
                    </div>
                )}
                {validation && (
                    <p role="alert" className="text-destructive">
                        {validation}
                    </p>
                )}
                <div className="flex gap-3">
                    <button
                        disabled={busy}
                        type="submit"
                        className="rounded-control bg-primary px-4 py-2 text-primary-foreground"
                    >
                        {copy.save}
                    </button>
                    {editing && (
                        <button type="button" onClick={reset} className="underline">
                            {copy.cancel}
                        </button>
                    )}
                </div>
            </form>
        </section>
    );
}
