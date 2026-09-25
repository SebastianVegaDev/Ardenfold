"use client";

import {
    createServiceRequestSchema,
    updateServiceRequestSchema,
    type PartyDetail,
    type ServiceRequestDetail,
} from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { fetchCurrentRequest, RequestWebError, submitRequest } from "../api/browser-client";

import { CustomerFields } from "./customer-fields";
import { ScopeFields, type ScopeDraft } from "./scope-fields";

type Props = Readonly<{
    locale: string;
    initial?: ServiceRequestDetail;
    initialCustomer?: PartyDetail | null;
    assetNames?: Record<string, string>;
    canReadAssets: boolean;
}>;

function draftFromRequest(
    request: ServiceRequestDetail | undefined,
    names: Record<string, string>,
): ScopeDraft[] {
    return (
        request?.scopeItems.map((item) => ({
            key: item.id,
            id: item.id,
            description: item.description,
            assetId: item.assetId,
            assetName: item.assetId ? (names[item.assetId] ?? item.assetId) : "",
            unidentifiedAssetDescription: item.unidentifiedAssetDescription ?? "",
        })) ?? []
    );
}

export function RequestEditor({
    locale,
    initial,
    initialCustomer = null,
    assetNames = {},
    canReadAssets,
}: Props) {
    const t = useTranslations("serviceRequests");
    const router = useRouter();
    const [customer, setCustomer] = useState<PartyDetail | null>(initialCustomer);
    const [contactId, setContactId] = useState(initial?.requesterContactId ?? "");
    const [requesterName, setRequesterName] = useState(initial?.requesterName ?? "");
    const [summary, setSummary] = useState(initial?.summary ?? "");
    const [context, setContext] = useState(initial?.customerContext ?? "");
    const [scope, setScope] = useState<ScopeDraft[]>(draftFromRequest(initial, assetNames));
    const [reason, setReason] = useState("");
    const [baseline, setBaseline] = useState(initial);
    const [expectedVersion, setExpectedVersion] = useState(initial?.version ?? 1);
    const [latest, setLatest] = useState<ServiceRequestDetail | null>(null);
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || latest) return;
        setError("");
        setLatest(null);
        if (!customer) {
            setError(t("customerRequired"));
            return;
        }
        const fields = {
            customerPartyId: customer.id,
            requesterContactId: contactId || null,
            requesterName: requesterName.trim() || null,
            summary: summary.trim(),
            customerContext: context.trim() || null,
            scopeItems: scope.map((item) => ({
                ...(initial && item.id ? { id: item.id } : {}),
                description: item.description.trim(),
                assetId: item.assetId,
                unidentifiedAssetDescription: item.unidentifiedAssetDescription.trim() || null,
            })),
        };
        const payload = initial
            ? updateServiceRequestSchema.safeParse({
                  ...fields,
                  customerPartyId:
                      customer.id === baseline?.customerPartyId ? undefined : customer.id,
                  requesterContactId:
                      customer.id === baseline?.customerPartyId &&
                      (contactId || null) === baseline?.requesterContactId
                          ? undefined
                          : contactId || null,
                  expectedVersion,
                  reason: reason.trim(),
              })
            : createServiceRequestSchema.safeParse(fields);
        if (!payload.success) {
            setError(t("validationError"));
            return;
        }
        setBusy(true);
        setSaving(true);
        let savedSuccessfully = false;
        try {
            const saved = await submitRequest(
                initial
                    ? { intent: "update", requestId: initial.id, payload: payload.data }
                    : { intent: "create", payload: payload.data },
            );
            savedSuccessfully = true;
            router.push(`/${locale}/app/service-requests/${saved.id}?notice=success`);
            router.refresh();
        } catch (cause) {
            if (cause instanceof RequestWebError && cause.code === "VERSION_CONFLICT" && initial) {
                try {
                    setLatest(await fetchCurrentRequest(initial.id));
                    setError(t("versionConflict"));
                } catch {
                    setError(t("loadError"));
                }
            } else if (cause instanceof RequestWebError && cause.status === 403) {
                setError(t("forbidden"));
            } else if (
                cause instanceof RequestWebError &&
                cause.code === "SERVICE_REQUEST_TERMINAL"
            ) {
                setError(t("terminalError"));
            } else {
                setError(t("saveError"));
            }
        } finally {
            if (!savedSuccessfully) {
                setBusy(false);
                setSaving(false);
            }
        }
    }

    return (
        <form onSubmit={(event) => void submit(event)} className="space-y-6">
            {error ? (
                <p
                    role="alert"
                    className="rounded-control border border-destructive/30 p-3 text-sm"
                >
                    {error}
                </p>
            ) : null}
            {latest ? (
                <div className="rounded-card border border-border bg-surface p-4" role="status">
                    <p className="font-semibold">
                        {t("latestVersion", { version: latest.version })}
                    </p>
                    <p className="mt-2">{latest.summary}</p>
                    <p className="mt-2 whitespace-pre-wrap">{latest.customerContext}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t("latestScope", { count: latest.scopeItems.length })}
                    </p>
                    <ul className="mt-2 list-disc pl-5">
                        {latest.scopeItems.map((item) => (
                            <li key={item.id}>
                                {item.description}
                                {item.unidentifiedAssetDescription
                                    ? ` — ${item.unidentifiedAssetDescription}`
                                    : ""}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-sm">{t("conflictReviewHint")}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                        <Link
                            className="text-primary underline"
                            href={`/${locale}/app/service-requests/${latest.id}`}
                            target="_blank"
                        >
                            {t("reviewLatest")}
                        </Link>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={latest.status !== "active"}
                            onClick={() => {
                                const currentIds = new Set(
                                    latest.scopeItems.map((item) => item.id),
                                );
                                setScope((items) =>
                                    items.map((item) => {
                                        if (!item.id || currentIds.has(item.id)) return item;
                                        const draft = { ...item };
                                        delete draft.id;
                                        return draft;
                                    }),
                                );
                                setBaseline(latest);
                                setExpectedVersion(latest.version);
                                setLatest(null);
                                setError("");
                            }}
                        >
                            {t("useLatestVersion")}
                        </Button>
                    </div>
                </div>
            ) : null}

            <fieldset disabled={busy} aria-busy={busy} className="space-y-6">
                <legend className="sr-only">{t("requestDetails")}</legend>
                <CustomerFields
                    customer={customer}
                    setCustomer={setCustomer}
                    contactId={contactId}
                    setContactId={setContactId}
                    requesterName={requesterName}
                    setRequesterName={setRequesterName}
                    busy={busy}
                    setBusy={setBusy}
                    setError={setError}
                />

                <section
                    className="space-y-4 rounded-card border border-border bg-surface p-5"
                    aria-labelledby="request-need-heading"
                >
                    <h2 id="request-need-heading" className="font-display text-xl font-semibold">
                        {t("needSection")}
                    </h2>
                    <div>
                        <Label htmlFor="request-summary">{t("summary")}</Label>
                        <Input
                            id="request-summary"
                            value={summary}
                            onChange={(event) => setSummary(event.target.value)}
                            required
                            maxLength={300}
                        />
                    </div>
                    <div>
                        <Label htmlFor="request-context">{t("customerContext")}</Label>
                        <textarea
                            id="request-context"
                            className="mt-2 min-h-28 w-full rounded-control border border-border bg-surface p-3"
                            value={context}
                            onChange={(event) => setContext(event.target.value)}
                            maxLength={10000}
                        />
                    </div>
                </section>

                <ScopeFields
                    scope={scope}
                    setScope={setScope}
                    canReadAssets={canReadAssets}
                    busy={busy}
                    setBusy={setBusy}
                    setError={setError}
                />

                {initial ? (
                    <div>
                        <Label htmlFor="request-reason">{t("changeReason")}</Label>
                        <Input
                            id="request-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            required
                            maxLength={1000}
                        />
                    </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={busy || latest !== null}>
                        {saving ? t("saving") : initial ? t("saveChanges") : t("create")}
                    </Button>
                    <Link
                        className="inline-flex h-10 items-center px-3 text-primary underline"
                        href={
                            initial
                                ? `/${locale}/app/service-requests/${initial.id}`
                                : `/${locale}/app/service-requests`
                        }
                    >
                        {t("cancelEdit")}
                    </Link>
                </div>
            </fieldset>
        </form>
    );
}
