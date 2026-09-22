"use client";

import { Button, Input, Label } from "@ardenfold/ui";
import { useState, type FormEvent } from "react";

type InvitationFormProps = Readonly<{
    locale: string;
    copy: Readonly<{
        email: string;
        role: string;
        invite: string;
        owner: string;
        administrator: string;
        member: string;
        viewer: string;
        created: string;
        copyHint: string;
        error: string;
    }>;
}>;

export function InvitationForm({ copy, locale }: InvitationFormProps) {
    const [acceptanceUrl, setAcceptanceUrl] = useState<string>();
    const [error, setError] = useState(false);
    const [pending, setPending] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        setPending(true);
        setError(false);
        setAcceptanceUrl(undefined);

        try {
            const response = await fetch("/auth/organization-management", {
                method: "POST",
                body: new FormData(form),
            });

            if (!response.ok) throw new Error("Invitation failed.");
            const data = (await response.json()) as { acceptanceToken?: string };
            if (!data.acceptanceToken) throw new Error("Invitation token missing.");
            setAcceptanceUrl(
                `${window.location.origin}/${locale}/app/invitations/accept?token=${encodeURIComponent(data.acceptanceToken)}`,
            );
            form.reset();
        } catch {
            setError(true);
        } finally {
            setPending(false);
        }
    }

    return (
        <form
            className="grid gap-4 sm:grid-cols-[1fr_12rem_auto]"
            onSubmit={(event) => void submit(event)}
        >
            <input name="intent" type="hidden" value="create-invitation" />
            <input name="locale" type="hidden" value={locale} />
            <div>
                <Label htmlFor="invitation-email">{copy.email}</Label>
                <Input id="invitation-email" name="email" required type="email" />
            </div>
            <div>
                <Label htmlFor="invitation-role">{copy.role}</Label>
                <select
                    className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                    defaultValue="member"
                    id="invitation-role"
                    name="role"
                >
                    <option value="owner">{copy.owner}</option>
                    <option value="administrator">{copy.administrator}</option>
                    <option value="member">{copy.member}</option>
                    <option value="viewer">{copy.viewer}</option>
                </select>
            </div>
            <Button className="self-end" disabled={pending} type="submit">
                {copy.invite}
            </Button>
            {acceptanceUrl ? (
                <div className="sm:col-span-3" role="status">
                    <p className="text-sm font-medium">{copy.created}</p>
                    <p className="text-xs text-muted-foreground">{copy.copyHint}</p>
                    <Input className="mt-2 font-mono text-xs" readOnly value={acceptanceUrl} />
                </div>
            ) : null}
            {error ? (
                <p className="text-sm text-destructive sm:col-span-3" role="alert">
                    {copy.error}
                </p>
            ) : null}
        </form>
    );
}
