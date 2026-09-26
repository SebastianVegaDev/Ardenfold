import { identifierSchema } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import type { Locale } from "@/i18n/locales";

import { QuoteActions } from "../acceptance/quote-actions";
import { getQuote, QuoteApiError } from "../api/quote-api";
import { QuoteEditor } from "../editor/quote-editor";
import { RevisionHistory } from "../revisions/revision-history";

type Props = Readonly<{
    locale: Locale;
    quoteId: string;
    editRevisionId?: string;
    notice?: string | undefined;
}>;

export async function QuoteDetailScreen({ locale, quoteId, editRevisionId, notice }: Props) {
    if (
        !identifierSchema.safeParse(quoteId).success ||
        (editRevisionId && !identifierSchema.safeParse(editRevisionId).success)
    )
        notFound();
    const t = await getTranslations("quotations");
    const { session, organization } = await getActiveOrganizationSession();
    const active = await getActiveOrganization(session.accessToken, organization.id);
    if (!active.permissions.includes("quotations.read"))
        return (
            <div className="mx-auto max-w-5xl p-6 sm:p-8">
                <h1>{t("title")}</h1>
                <p role="alert">{t("forbidden")}</p>
            </div>
        );
    let quote;
    try {
        quote = await getQuote(session.accessToken, organization.id, quoteId);
    } catch (error) {
        if (error instanceof QuoteApiError && error.status === 404) notFound();
        return (
            <div className="mx-auto max-w-5xl p-6 sm:p-8">
                <h1>{t("title")}</h1>
                <p role="alert">
                    {error instanceof QuoteApiError && error.status === 403
                        ? t("forbidden")
                        : t("loadError")}
                </p>
            </div>
        );
    }
    const canRevise = (
        ["quotations.write", "service_requests.read", "parties.read", "assets.read"] as const
    ).every((permission) => active.permissions.includes(permission));
    const canDecide = (["quotations.write", "service_requests.read"] as const).every((permission) =>
        active.permissions.includes(permission),
    );
    const revision = editRevisionId
        ? quote.revisions.find((item) => item.id === editRevisionId)
        : null;
    if (editRevisionId && !revision) notFound();
    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
            <Link className="text-primary underline" href={`/${locale}/app/quotations`}>
                {t("back")}
            </Link>
            <header>
                <h1 className="font-display text-3xl font-semibold">{quote.reference}</h1>
                <p className="mt-2 text-muted-foreground">
                    {t(`quoteStatuses.${quote.status}`)} ·{" "}
                    {t("version", { version: quote.version })}
                </p>
                <Link
                    className="mt-2 inline-block text-primary underline"
                    href={`/${locale}/app/service-requests/${quote.requestId}`}
                >
                    {t("viewRequest")}
                </Link>
            </header>
            {notice === "success" ? (
                <p role="status" className="rounded-control border border-border bg-surface p-3">
                    {t("saved")}
                </p>
            ) : null}
            {editRevisionId ? (
                canRevise && revision?.status === "draft" && quote.status !== "closed" ? (
                    <QuoteEditor locale={locale} quote={quote} revisionId={editRevisionId} />
                ) : (
                    <p role="alert">{t("revisionLocked")}</p>
                )
            ) : (
                <>
                    <RevisionHistory
                        quote={quote}
                        locale={locale}
                        timeZone={active.defaultTimeZone}
                    />
                    <QuoteActions
                        quote={quote}
                        locale={locale}
                        canRevise={canRevise}
                        canDecide={canDecide}
                        canAccept={canDecide && active.permissions.includes("parties.read")}
                    />
                </>
            )}
        </div>
    );
}
