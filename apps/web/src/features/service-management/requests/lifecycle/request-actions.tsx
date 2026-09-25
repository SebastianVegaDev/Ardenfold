"use client";

import { transitionServiceRequestSchema } from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RequestWebError, submitRequest } from "../api/browser-client";

type Props = Readonly<{ requestId: string; version: number }>;

export function RequestActions({ requestId, version }: Props) {
    const t = useTranslations("serviceRequests");
    const router = useRouter();
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function transition(intent: "cancel" | "close") {
        setError("");
        const payload = transitionServiceRequestSchema.safeParse({
            expectedVersion: version,
            reason: reason.trim(),
        });
        if (!payload.success) {
            setError(t("validationError"));
            return;
        }
        setBusy(true);
        let savedSuccessfully = false;
        try {
            await submitRequest({ intent, requestId, payload: payload.data });
            savedSuccessfully = true;
            router.refresh();
        } catch (cause) {
            if (cause instanceof RequestWebError && cause.code === "VERSION_CONFLICT") {
                setError(t("transitionConflict"));
            } else if (
                cause instanceof RequestWebError &&
                cause.code === "SERVICE_REQUEST_TERMINAL"
            ) {
                setError(t("terminalError"));
            } else if (cause instanceof RequestWebError && cause.status === 403) {
                setError(t("forbidden"));
            } else {
                setError(t("saveError"));
            }
        } finally {
            if (!savedSuccessfully) setBusy(false);
        }
    }

    return (
        <section
            className="rounded-card border border-border bg-surface p-5"
            aria-labelledby="request-actions-heading"
        >
            <h2 id="request-actions-heading" className="font-display text-xl font-semibold">
                {t("lifecycleSection")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("lifecycleHint")}</p>
            {error ? (
                <p role="alert" className="mt-3 text-destructive">
                    {error}{" "}
                    <Button type="button" variant="outline" onClick={() => router.refresh()}>
                        {t("refresh")}
                    </Button>
                </p>
            ) : null}
            <form
                className="mt-4 space-y-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    void transition("close");
                }}
            >
                <div>
                    <Label htmlFor="request-transition-reason">{t("transitionReason")}</Label>
                    <Input
                        id="request-transition-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        required
                        maxLength={1000}
                    />
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button disabled={busy} type="submit">
                        {t("close")}
                    </Button>
                    <Button
                        disabled={busy || !reason.trim()}
                        type="button"
                        variant="outline"
                        onClick={() => void transition("cancel")}
                    >
                        {t("cancelRequest")}
                    </Button>
                </div>
            </form>
        </section>
    );
}
