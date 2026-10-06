"use client";

import { technicalExecutionListQuerySchema } from "@ardenfold/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { technicalRequest } from "../../api/technical-client";

type Entry = {
    execution: {
        id: string;
        status: string;
        historicalScope: string;
        workOrderId: string;
        workItemId: string;
        startedAt: string;
        targetAsset: { historicalLabel: string | null; currentName: string | null } | null;
    };
    latestRevision: { number: number; status: string };
    customer: { currentName: string };
};
type Page = { data: Entry[]; nextCursor: string | null };
type Copy = Record<string, string>;

export function ExecutionListScreen({ locale, copy }: { locale: string; copy: Copy }) {
    const [status, setStatus] = useState("");
    const [page, setPage] = useState<Page | null>(null);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);
    const [generation, setGeneration] = useState(0);
    const fetchPage = useCallback(
        async (cursor?: string) => {
            const parsed = technicalExecutionListQuerySchema.parse({
                limit: 25,
                ...(status ? { status } : {}),
                ...(cursor ? { cursor } : {}),
            });
            const params = new URLSearchParams({ limit: String(parsed.limit), sort: parsed.sort });
            if (parsed.status) params.set("status", parsed.status);
            if (parsed.cursor) params.set("cursor", parsed.cursor);
            return technicalRequest<Page>(`technical-executions?${params}`);
        },
        [status],
    );
    useEffect(() => {
        let current = true;
        setLoading(true);
        setError(false);
        fetchPage()
            .then((result) => {
                if (current) setPage(result);
            })
            .catch(() => {
                if (current) setError(true);
            })
            .finally(() => {
                if (current) setLoading(false);
            });
        return () => {
            current = false;
        };
    }, [fetchPage, generation]);
    async function next() {
        if (!page?.nextCursor) return;
        setLoading(true);
        try {
            const nextPage = await fetchPage(page.nextCursor);
            setPage({ data: [...page.data, ...nextPage.data], nextCursor: nextPage.nextCursor });
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }
    return (
        <main className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
            <Link href={`/${locale}/app/technical-operations`} className="text-primary underline">
                {copy.back}
            </Link>
            <header>
                <h1 className="font-display text-3xl font-semibold">{copy.allExecutions}</h1>
            </header>
            <label className="block max-w-xs text-sm">
                {copy.status}
                <select
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(null);
                    }}
                    className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2"
                >
                    <option value="">{copy.allStatuses}</option>
                    <option value="active">{copy.active}</option>
                    <option value="abandoned">{copy.abandoned}</option>
                </select>
            </label>
            {error && (
                <p role="alert">
                    {copy.error}{" "}
                    <button
                        type="button"
                        className="underline"
                        onClick={() => setGeneration((value) => value + 1)}
                    >
                        {copy.retry}
                    </button>
                </p>
            )}
            {loading && !page && <p role="status">{copy.loading}</p>}
            {!loading && page?.data.length === 0 && <p>{copy.empty}</p>}
            <ul className="grid gap-3 md:grid-cols-2">
                {page?.data.map((entry) => (
                    <li
                        key={entry.execution.id}
                        className="rounded-control border border-border p-4"
                    >
                        <h2 className="font-semibold">{entry.execution.historicalScope}</h2>
                        <p className="mt-1 text-sm">{entry.customer.currentName}</p>
                        <p className="text-sm text-muted-foreground">
                            {entry.execution.targetAsset?.currentName ??
                                entry.execution.targetAsset?.historicalLabel}
                        </p>
                        <p className="text-sm">
                            {copy.revision} {entry.latestRevision.number} ·{" "}
                            {entry.latestRevision.status}
                        </p>
                        <Link
                            href={`/${locale}/app/technical-operations/${entry.execution.id}`}
                            className="mt-3 inline-block text-primary underline"
                        >
                            {copy.open}
                        </Link>
                    </li>
                ))}
            </ul>
            {page?.nextCursor && (
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => void next()}
                    className="rounded-control border border-border px-4 py-2"
                >
                    {copy.next}
                </button>
            )}
        </main>
    );
}
