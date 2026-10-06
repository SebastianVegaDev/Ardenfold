"use client";

import {
    startTechnicalExecutionSchema,
    technicalQueueKindSchema,
    type TechnicalQueueResponse,
} from "@ardenfold/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchCurrentWorkOrder } from "@/features/service-management/work-orders/api/browser-client";

import { fetchQueue, TechnicalWebError, technicalRequest } from "../../api/technical-client";

type Copy = {
    title: string;
    description: string;
    loading: string;
    empty: string;
    retry: string;
    next: string;
    start: string;
    open: string;
    allExecutions: string;
    conflict: string;
    error: string;
    forbidden: string;
    queue: Record<string, string>;
    workOrder: string;
    workItem: string;
    asset: string;
};

export function TechnicalQueueScreen({
    locale,
    canWrite,
    copy,
}: {
    locale: string;
    canWrite: boolean;
    copy: Copy;
}) {
    const router = useRouter();
    const [kind, setKind] = useState("ready_to_execute");
    const [page, setPage] = useState<TechnicalQueueResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [generation, setGeneration] = useState(0);
    useEffect(() => {
        let current = true;
        setLoading(true);
        setError(null);
        fetchQueue(kind)
            .then((value) => {
                if (current) setPage(value);
            })
            .catch((cause: unknown) => {
                if (current)
                    setError(
                        cause instanceof TechnicalWebError && cause.status === 403
                            ? copy.forbidden
                            : copy.error,
                    );
            })
            .finally(() => {
                if (current) setLoading(false);
            });
        return () => {
            current = false;
        };
    }, [kind, generation, copy.error, copy.forbidden]);

    async function nextPage() {
        if (!page?.nextCursor) return;
        setLoading(true);
        try {
            const following = await fetchQueue(kind, page.nextCursor);
            setPage({ data: [...page.data, ...following.data], nextCursor: following.nextCursor });
        } catch {
            setError(copy.error);
        } finally {
            setLoading(false);
        }
    }

    async function start(workOrderId: string, workItemId: string) {
        setBusyId(workItemId);
        setError(null);
        try {
            const order = await fetchCurrentWorkOrder(workOrderId);
            const item = order.items.find((candidate) => candidate.id === workItemId);
            if (!item || item.status !== "ready" || order.status !== "ready")
                throw new TechnicalWebError(409, "STALE_WORK_ITEM");
            const payload = startTechnicalExecutionSchema.parse({
                workOrderId,
                workItemId,
                expectedOrderVersion: order.version,
                expectedItemVersion: item.version,
                idempotencyKey: crypto.randomUUID(),
            });
            const result = await technicalRequest<{ execution: { id: string } }>(
                "technical-executions",
                { method: "POST", body: payload },
            );
            router.push(`/${locale}/app/technical-operations/${result.execution.id}`);
        } catch (cause) {
            setError(
                cause instanceof TechnicalWebError && cause.status === 409
                    ? copy.conflict
                    : copy.error,
            );
            setGeneration((value) => value + 1);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <main className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
            <header>
                <h1 className="font-display text-3xl font-semibold">{copy.title}</h1>
                <p className="mt-2 text-muted-foreground">{copy.description}</p>
                <Link
                    href={`/${locale}/app/technical-operations/executions`}
                    className="mt-3 inline-block text-primary underline"
                >
                    {copy.allExecutions}
                </Link>
            </header>
            <nav aria-label={copy.queue[kind]} className="flex flex-wrap gap-2">
                {technicalQueueKindSchema.options.map((candidate) => (
                    <button
                        key={candidate}
                        type="button"
                        aria-current={kind === candidate ? "page" : undefined}
                        onClick={() => {
                            setKind(candidate);
                            setPage(null);
                        }}
                        className={`rounded-control border px-3 py-2 text-sm ${kind === candidate ? "border-primary bg-secondary font-semibold" : "border-border"}`}
                    >
                        {copy.queue[candidate]}
                    </button>
                ))}
            </nav>
            {error && (
                <div role="alert" className="rounded-control border border-destructive p-4">
                    {error}{" "}
                    <button
                        type="button"
                        className="underline"
                        onClick={() => setGeneration((value) => value + 1)}
                    >
                        {copy.retry}
                    </button>
                </div>
            )}
            {loading && !page ? <p role="status">{copy.loading}</p> : null}
            {!loading && page?.data.length === 0 ? <p>{copy.empty}</p> : null}
            <ul className="grid gap-4 md:grid-cols-2">
                {page?.data.map((entry) => (
                    <li
                        key={entry.subjectId}
                        className="rounded-control border border-border bg-surface p-5"
                    >
                        <h2 className="font-semibold">{entry.customer.currentName}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {copy.workOrder}: {entry.workOrderId}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {copy.workItem}: {entry.workItemId}
                        </p>
                        {entry.asset && (
                            <p className="mt-2 text-sm">
                                {copy.asset}: {entry.asset.currentName}
                            </p>
                        )}
                        <div className="mt-4">
                            <span className="text-sm">{entry.status}</span>
                        </div>
                        {entry.executionId ? (
                            <Link
                                className="mt-4 inline-block text-primary underline"
                                href={`/${locale}/app/technical-operations/${entry.executionId}`}
                            >
                                {copy.open}
                            </Link>
                        ) : canWrite && kind === "ready_to_execute" ? (
                            <button
                                type="button"
                                disabled={busyId === entry.workItemId}
                                className="mt-4 rounded-control bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                                onClick={() => void start(entry.workOrderId, entry.workItemId)}
                            >
                                {copy.start}
                            </button>
                        ) : null}
                    </li>
                ))}
            </ul>
            {page?.nextCursor && (
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => void nextPage()}
                    className="rounded-control border border-border px-4 py-2"
                >
                    {copy.next}
                </button>
            )}
        </main>
    );
}
