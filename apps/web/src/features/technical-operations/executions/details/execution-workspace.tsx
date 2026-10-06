"use client";

import {
    createSuccessorRevisionSchema,
    submitExecutionRevisionSchema,
    type OrganizationSite,
} from "@ardenfold/contracts";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
    technicalRequest,
    fetchExecution,
    fetchResults,
    fetchEvidence,
    TechnicalWebError,
    type ExecutionDetail,
    type ResultsDetail,
    type EvidenceRow,
} from "../../api/technical-client";
import { EvidenceEditor } from "../../evidence/upload/evidence-editor";
import { ResultEditor } from "../../results/editor/result-editor";
import { ResultPresentation } from "../../results/presentation/result-presentation";
import { DraftEditor } from "../editor/draft-editor";

export function ExecutionWorkspace({
    id,
    locale,
    currentUserId,
    canWrite,
    canReadEvidence,
    canUpload,
    canDownload,
    context,
    sites,
}: {
    id: string;
    locale: string;
    currentUserId: string;
    canWrite: boolean;
    canReadEvidence: boolean;
    canUpload: boolean;
    canDownload: boolean;
    context: {
        customerName: string;
        customerPartyId: string;
        workOrderReference: string;
        assetName: string | null;
    } | null;
    sites: OrganizationSite[];
}) {
    const t = useTranslations("technicalWorkspace");
    const [detail, setDetail] = useState<ExecutionDetail | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [results, setResults] = useState<ResultsDetail | null>(null);
    const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    const [generation, setGeneration] = useState(0);
    const copyKeys = [
        "context",
        "performer",
        "unassigned",
        "me",
        "method",
        "methodIdentifier",
        "methodVersion",
        "startedAt",
        "endedAt",
        "location",
        "site",
        "notes",
        "conditions",
        "name",
        "decimalValue",
        "unit",
        "textValue",
        "remove",
        "addCondition",
        "supportingAssets",
        "assetSearch",
        "search",
        "assetId",
        "assetUse",
        "addAsset",
        "save",
        "invalid",
        "results",
        "noResults",
        "missing",
        "not_observed",
        "not_applicable",
        "unavailable",
        "edit",
        "up",
        "down",
        "group",
        "addGroup",
        "editResult",
        "addResult",
        "kind",
        "quantitative",
        "categorical",
        "textual",
        "ungrouped",
        "characteristic",
        "contextNote",
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
        "textLanguage",
        "missingReason",
        "missingExplanation",
        "conformity",
        "conformityRule",
        "conforms",
        "does_not_conform",
        "undetermined",
        "cancel",
        "evidence",
        "noEvidence",
        "file",
        "observation",
        "download",
        "target",
        "revision",
        "evidenceType",
        "descriptionLabel",
        "chooseFile",
        "hashing",
        "reserved",
        "uploading",
        "uploaded",
        "finalizing",
        "finalized",
        "attaching",
        "error",
        "retry",
        "attach",
    ] as const;
    const copy = Object.fromEntries(copyKeys.map((key) => [key, t(key)]));

    const load = useCallback(
        async (requestedId?: string | null) => {
            const fresh = await fetchExecution(id);
            const selected =
                fresh.revisions.find((revision) => revision.id === requestedId) ??
                fresh.revisions.at(-1);
            if (!selected) throw new Error("NO_REVISION");
            const [nextResults, nextEvidence] = await Promise.all([
                fetchResults(id, selected.id),
                canReadEvidence ? fetchEvidence(id, selected.id) : Promise.resolve([]),
            ]);
            setDetail(fresh);
            setSelectedId(selected.id);
            setResults(nextResults);
            setEvidence(nextEvidence);
        },
        [id, canReadEvidence],
    );

    useEffect(() => {
        let current = true;
        setLoading(true);
        Promise.all([fetchExecution(id)])
            .then(async ([fresh]) => {
                const selected = fresh.revisions.at(-1);
                if (!selected) throw new Error("NO_REVISION");
                const [nextResults, nextEvidence] = await Promise.all([
                    fetchResults(id, selected.id),
                    canReadEvidence ? fetchEvidence(id, selected.id) : Promise.resolve([]),
                ]);
                if (current) {
                    setDetail(fresh);
                    setSelectedId(selected.id);
                    setResults(nextResults);
                    setEvidence(nextEvidence);
                }
            })
            .catch((cause: unknown) => {
                if (current)
                    setError(
                        cause instanceof TechnicalWebError && cause.status === 403
                            ? t("forbidden")
                            : t("loadError"),
                    );
            })
            .finally(() => {
                if (current) setLoading(false);
            });
        return () => {
            current = false;
        };
    }, [id, generation, canReadEvidence, t]);

    function handleError(cause: unknown) {
        setError(
            cause instanceof TechnicalWebError && cause.status === 409
                ? t("conflict")
                : t("actionError"),
        );
        if (cause instanceof TechnicalWebError && cause.status === 409)
            void load(selectedId).catch(() => setGeneration((value) => value + 1));
    }
    async function refresh() {
        setError(null);
        await load(selectedId);
    }
    async function selectRevision(revisionId: string) {
        setLoading(true);
        setError(null);
        try {
            await load(revisionId);
        } catch (cause) {
            handleError(cause);
        } finally {
            setLoading(false);
        }
    }
    async function submit() {
        if (!detail || !revision || !confirmSubmit) return;
        setBusy(true);
        setError(null);
        try {
            const payload = submitExecutionRevisionSchema.parse({
                expectedVersion: revision.version,
                idempotencyKey: crypto.randomUUID(),
            });
            await technicalRequest(`technical-executions/${id}/revisions/${revision.id}/submit`, {
                method: "POST",
                body: payload,
            });
            setConfirmSubmit(false);
            await refresh();
        } catch (cause) {
            handleError(cause);
        } finally {
            setBusy(false);
        }
    }
    async function successor() {
        if (!detail || !revision) return;
        const payload = createSuccessorRevisionSchema.safeParse({
            expectedExecutionVersion: detail.execution.version,
            predecessorRevisionId: revision.id,
            reason,
            idempotencyKey: crypto.randomUUID(),
        });
        if (!payload.success) {
            setError(t("reasonRequired"));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const created = await technicalRequest<{ id: string }>(
                `technical-executions/${id}/revisions`,
                { method: "POST", body: payload.data },
            );
            setReason("");
            await load(created.id);
        } catch (cause) {
            handleError(cause);
        } finally {
            setBusy(false);
        }
    }

    const revision = detail?.revisions.find((item) => item.id === selectedId);
    const latest = detail?.revisions.at(-1);
    const editable = Boolean(
        canWrite &&
        detail?.execution.status === "active" &&
        revision?.status === "draft" &&
        revision?.id === latest?.id,
    );
    const reviewEvent = detail?.history.findLast(
        (event) => event.revisionId === latest?.id && event.kind === "review_decided",
    );
    const approvalEvent = detail?.history.findLast(
        (event) => event.revisionId === latest?.id && event.kind === "approval_decided",
    );
    const canCreateSuccessor = Boolean(
        canWrite &&
        latest &&
        latest.id === revision?.id &&
        latest.status !== "draft" &&
        (latest.status === "discarded" ||
            reviewEvent?.snapshot.outcome === "changes_requested" ||
            approvalEvent?.snapshot.outcome === "rejected"),
    );
    const blockers = [
        !revision?.performerUserId ? t("needsPerformer") : null,
        !revision?.methodName ? t("needsMethod") : null,
        !results?.results.length && !evidence.length ? t("needsContent") : null,
    ].filter(Boolean);

    if (loading && !detail)
        return (
            <p role="status" className="p-6">
                {t("loading")}
            </p>
        );
    if (!detail || !revision || !results)
        return (
            <div role="alert" className="p-6">
                {error ?? t("loadError")}{" "}
                <button
                    type="button"
                    className="underline"
                    onClick={() => setGeneration((value) => value + 1)}
                >
                    {t("retry")}
                </button>
            </div>
        );
    return (
        <main className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
            <Link href={`/${locale}/app/technical-operations`} className="text-primary underline">
                {t("back")}
            </Link>
            <header className="space-y-2">
                <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
                <p>{detail.execution.scopeDescriptionAtStart}</p>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {context && (
                        <span>
                            {t("customer")}: {context.customerName}
                        </span>
                    )}
                    <span>
                        {t("workOrder")}:{" "}
                        {context?.workOrderReference ?? detail.execution.workOrderId}
                    </span>
                    <span>
                        {t("workItem")}: {detail.execution.workItemId}
                    </span>
                    <span>
                        {t("site")}: {detail.execution.siteNameAtStart}
                    </span>
                    {detail.execution.targetAssetLabelAtStart && (
                        <span>
                            {t("asset")}:{" "}
                            {context?.assetName ?? detail.execution.targetAssetLabelAtStart}
                        </span>
                    )}
                </div>
            </header>
            {error && (
                <div role="alert" className="rounded-control border border-destructive p-4">
                    {error}{" "}
                    <button type="button" className="ml-2 underline" onClick={() => void refresh()}>
                        {t("refresh")}
                    </button>
                </div>
            )}
            <section className="space-y-3">
                <h2 className="text-xl font-semibold">{t("revisions")}</h2>
                <div className="flex flex-wrap gap-2">
                    {detail.revisions.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            aria-current={item.id === revision.id ? "page" : undefined}
                            onClick={() => void selectRevision(item.id)}
                            className={`rounded-control border px-3 py-2 ${item.id === revision.id ? "border-primary bg-secondary" : "border-border"}`}
                        >
                            {t("revisionNumber", { number: item.revisionNumber })} ·{" "}
                            {t(`status.${item.status}`)}
                        </button>
                    ))}
                </div>
                <p className="text-sm">{editable ? t("editable") : t("readOnly")}</p>
                {revision.correctionReason && (
                    <p className="text-sm">
                        {t("correctionReason")}: {revision.correctionReason}
                    </p>
                )}
                {reviewEvent?.snapshot.outcome === "changes_requested" && (
                    <p role="status">{t("changesRequested")}</p>
                )}
            </section>
            {editable ? (
                <>
                    <DraftEditor
                        key={`${revision.id}:${revision.version}`}
                        execution={detail.execution}
                        revision={revision}
                        conditions={detail.conditions.filter(
                            (item) => item.revisionId === revision.id,
                        )}
                        supportingAssets={detail.supportingAssets.filter(
                            (item) => item.revisionId === revision.id,
                        )}
                        currentUserId={currentUserId}
                        sites={sites}
                        copy={copy}
                        onSaved={refresh}
                        onError={handleError}
                    />
                    <ResultEditor
                        key={`${revision.id}:${revision.version}:results`}
                        execution={detail.execution}
                        revision={revision}
                        groups={results.groups}
                        results={results.results}
                        copy={copy}
                        onSaved={refresh}
                        onError={handleError}
                    />
                    {canReadEvidence && (
                        <EvidenceEditor
                            key={`${revision.id}:${revision.version}:evidence`}
                            execution={detail.execution}
                            revision={revision}
                            results={results.results}
                            evidence={evidence}
                            canUpload={canUpload}
                            canDownload={canDownload}
                            copy={copy}
                            onSaved={refresh}
                            onError={handleError}
                        />
                    )}
                    <section className="space-y-3 rounded-control border border-border p-5">
                        <h2 className="text-xl font-semibold">{t("submitTitle")}</h2>
                        <p>{t("submitDescription", { number: revision.revisionNumber })}</p>
                        {blockers.length > 0 && (
                            <ul className="list-inside list-disc text-sm text-destructive">
                                {blockers.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        )}
                        <label className="flex items-start gap-2">
                            <input
                                type="checkbox"
                                checked={confirmSubmit}
                                onChange={(event) => setConfirmSubmit(event.target.checked)}
                            />
                            <span>{t("confirmSubmit", { number: revision.revisionNumber })}</span>
                        </label>
                        <button
                            type="button"
                            disabled={busy || blockers.length > 0 || !confirmSubmit}
                            onClick={() => void submit()}
                            className="rounded-control bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                        >
                            {t("submit")}
                        </button>
                    </section>
                </>
            ) : (
                <div className="space-y-5">
                    <section className="rounded-control border border-border p-5">
                        <h2 className="text-xl font-semibold">{t("context")}</h2>
                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="font-medium">{t("performer")}</dt>
                                <dd>{revision.performerNameSnapshot ?? t("unassigned")}</dd>
                            </div>
                            <div>
                                <dt className="font-medium">{t("method")}</dt>
                                <dd>{revision.methodName ?? "—"}</dd>
                            </div>
                            <div>
                                <dt className="font-medium">{t("location")}</dt>
                                <dd>{revision.performedLocationSnapshot ?? "—"}</dd>
                            </div>
                        </dl>
                        <p className="mt-3 text-sm whitespace-pre-wrap">
                            {revision.technicianNotes}
                        </p>
                        {detail.conditions.filter((item) => item.revisionId === revision.id)
                            .length > 0 && (
                            <div className="mt-4">
                                <h3 className="font-medium">{t("conditions")}</h3>
                                {detail.conditions
                                    .filter((item) => item.revisionId === revision.id)
                                    .map((item) => (
                                        <p key={item.position} className="text-sm">
                                            {item.name}:{" "}
                                            {item.decimalValue !== null
                                                ? `${item.decimalValue} ${item.unitCode ?? ""}`
                                                : item.textValue}
                                        </p>
                                    ))}
                            </div>
                        )}
                        {detail.supportingAssets.filter((item) => item.revisionId === revision.id)
                            .length > 0 && (
                            <div className="mt-4">
                                <h3 className="font-medium">{t("supportingAssets")}</h3>
                                {detail.supportingAssets
                                    .filter((item) => item.revisionId === revision.id)
                                    .map((item) => (
                                        <p key={item.assetId} className="text-sm">
                                            {item.assetId}: {item.use}
                                        </p>
                                    ))}
                            </div>
                        )}
                    </section>
                    <section className="rounded-control border border-border p-5">
                        <h2 className="text-xl font-semibold">{t("results")}</h2>
                        <ResultPresentation
                            groups={results.groups}
                            results={results.results}
                            copy={copy}
                        />
                    </section>
                    {canReadEvidence && (
                        <section className="rounded-control border border-border p-5">
                            <h2 className="text-xl font-semibold">{t("evidence")}</h2>
                            {evidence
                                .filter((item) => !item.removedAt)
                                .map((item) => (
                                    <p key={item.id} className="mt-2 text-sm">
                                        {item.description}{" "}
                                        {item.kind === "file" && canDownload && (
                                            <a
                                                href={`/auth/technical/technical-executions/${id}/revisions/${revision.id}/evidence/${item.id}/content`}
                                                className="text-primary underline"
                                            >
                                                {t("download")}
                                            </a>
                                        )}
                                    </p>
                                ))}
                        </section>
                    )}
                </div>
            )}
            {canCreateSuccessor && (
                <section className="space-y-3 rounded-control border border-border p-5">
                    <h2 className="text-xl font-semibold">{t("successorTitle")}</h2>
                    <p>{t("successorDescription")}</p>
                    <label className="block text-sm">
                        {t("reason")}
                        <textarea
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            className="mt-1 w-full rounded-control border border-border bg-surface p-3"
                            rows={3}
                        />
                    </label>
                    <button
                        disabled={busy}
                        type="button"
                        onClick={() => void successor()}
                        className="rounded-control bg-primary px-4 py-2 text-primary-foreground"
                    >
                        {t("createSuccessor")}
                    </button>
                </section>
            )}
        </main>
    );
}
