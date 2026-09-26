import type { QuoteDetail } from "@ardenfold/contracts";
import { useTranslations } from "next-intl";

import type { Locale } from "@/i18n/locales";

import { activeAcceptedRevision, formatQuoteDecimal, formatQuoteMoney } from "./quote-format";

type Props = Readonly<{ quote: QuoteDetail; locale: Locale; timeZone: string }>;

export function RevisionHistory({ quote, locale, timeZone }: Props) {
    const t = useTranslations("quotations");
    const acceptedId = activeAcceptedRevision(quote);
    const date = (value: string) =>
        new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone,
        }).format(new Date(value));
    return (
        <section aria-labelledby="quote-revisions-heading" className="space-y-4">
            <h2 id="quote-revisions-heading" className="font-display text-2xl font-semibold">
                {t("revisionHistory")}
            </h2>
            {acceptedId ? (
                <p role="status" className="rounded-control border border-primary p-3">
                    {t("acceptedRevision", {
                        number:
                            quote.revisions.find((item) => item.id === acceptedId)
                                ?.revisionNumber ?? 0,
                    })}
                </p>
            ) : null}
            <ol className="space-y-4">
                {[...quote.revisions]
                    .sort((a, b) => b.revisionNumber - a.revisionNumber)
                    .map((revision, index) => (
                        <li
                            key={revision.id}
                            className="rounded-card border border-border bg-surface p-5"
                            aria-label={t("revision", { number: revision.revisionNumber })}
                        >
                            <header className="flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="font-semibold">
                                    {t("revision", { number: revision.revisionNumber })}
                                </h3>
                                <div className="flex flex-wrap gap-2 text-sm">
                                    {index === 0 ? (
                                        <span className="font-medium">{t("current")}</span>
                                    ) : null}
                                    <span>{t(`revisionStatuses.${revision.status}`)}</span>
                                    {acceptedId === revision.id ? (
                                        <strong>{t("activeAgreement")}</strong>
                                    ) : null}
                                </div>
                            </header>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {t("createdAt")}: {date(revision.createdAt)}
                            </p>
                            {revision.sourceRevisionId ? (
                                <p className="text-sm text-muted-foreground">
                                    {t("copiedFrom", {
                                        number:
                                            quote.revisions.find(
                                                (item) => item.id === revision.sourceRevisionId,
                                            )?.revisionNumber ?? 0,
                                    })}
                                </p>
                            ) : null}
                            {revision.issuedAt ? (
                                <p className="text-sm">
                                    {t("issuedAt")}: {date(revision.issuedAt)} ·{" "}
                                    {revision.issueChannel}
                                </p>
                            ) : null}
                            {revision.validUntil ? (
                                <p className="text-sm">
                                    {t("validUntil")}: {date(revision.validUntil)}
                                </p>
                            ) : (
                                <p className="text-sm">{t("noExpiry")}</p>
                            )}
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[36rem] text-left text-sm">
                                    <caption className="sr-only">
                                        {t("linesForRevision", { number: revision.revisionNumber })}
                                    </caption>
                                    <thead>
                                        <tr className="border-b border-border">
                                            <th scope="col" className="py-2">
                                                {t("description")}
                                            </th>
                                            <th scope="col">{t("quantity")}</th>
                                            <th scope="col">{t("unitPrice")}</th>
                                            <th scope="col" className="text-right">
                                                {t("amount")}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {revision.lines.map((line) => (
                                            <tr
                                                key={line.id}
                                                className="border-b border-border align-top"
                                            >
                                                <td className="py-2 whitespace-pre-wrap">
                                                    {line.description}
                                                    {line.adjustments.length ? (
                                                        <ul className="mt-1 text-muted-foreground">
                                                            {line.adjustments.map(
                                                                (adjustment, i) => (
                                                                    <li key={i}>
                                                                        {adjustment.label}:{" "}
                                                                        {formatQuoteMoney(
                                                                            adjustment.amount,
                                                                            revision.currencyCode,
                                                                            revision.currencyScale,
                                                                            locale,
                                                                        )}
                                                                    </li>
                                                                ),
                                                            )}
                                                        </ul>
                                                    ) : null}
                                                </td>
                                                <td>
                                                    {formatQuoteDecimal(line.quantity, locale)}{" "}
                                                    {line.unit}
                                                </td>
                                                <td>
                                                    {formatQuoteMoney(
                                                        line.unitPrice,
                                                        revision.currencyCode,
                                                        Math.max(
                                                            revision.currencyScale,
                                                            line.unitPrice.split(".")[1]?.length ??
                                                                0,
                                                        ),
                                                        locale,
                                                    )}
                                                </td>
                                                <td className="text-right">
                                                    {line.totalAmount === null
                                                        ? t("pendingCalculation")
                                                        : formatQuoteMoney(
                                                              line.totalAmount,
                                                              revision.currencyCode,
                                                              revision.currencyScale,
                                                              locale,
                                                          )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {revision.adjustments.length ? (
                                <dl className="mt-3 space-y-1 text-sm">
                                    {revision.adjustments.map((adjustment, i) => (
                                        <div key={i} className="flex justify-between gap-4">
                                            <dt>{adjustment.label}</dt>
                                            <dd>
                                                {formatQuoteMoney(
                                                    adjustment.amount,
                                                    revision.currencyCode,
                                                    revision.currencyScale,
                                                    locale,
                                                )}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : null}
                            <dl className="mt-4 border-t border-border pt-3 text-sm">
                                <div className="flex justify-between gap-4">
                                    <dt>{t("subtotal")}</dt>
                                    <dd>
                                        {revision.subtotal === null
                                            ? t("pendingCalculation")
                                            : formatQuoteMoney(
                                                  revision.subtotal,
                                                  revision.currencyCode,
                                                  revision.currencyScale,
                                                  locale,
                                              )}
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-4 font-semibold">
                                    <dt>{t("total")}</dt>
                                    <dd>
                                        {revision.total === null
                                            ? t("pendingCalculation")
                                            : formatQuoteMoney(
                                                  revision.total,
                                                  revision.currencyCode,
                                                  revision.currencyScale,
                                                  locale,
                                              )}
                                    </dd>
                                </div>
                            </dl>
                            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                                {(
                                    [
                                        "paymentTerms",
                                        "deliveryTerms",
                                        "serviceLocation",
                                        "intakeExpectations",
                                        "exclusions",
                                    ] as const
                                ).map((field) => (
                                    <div key={field}>
                                        <dt className="font-medium">{t(field)}</dt>
                                        <dd className="whitespace-pre-wrap">
                                            {revision[field] ?? t("notProvided")}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            {quote.acceptances
                                .filter((acceptance) => acceptance.revisionId === revision.id)
                                .map((acceptance) => (
                                    <div
                                        key={acceptance.id}
                                        className="mt-4 rounded-control border border-primary/40 p-3 text-sm"
                                    >
                                        <p className="font-semibold">
                                            {t("acceptanceRecorded")}: {date(acceptance.recordedAt)}
                                        </p>
                                        <p>
                                            {t("channel")}: {acceptance.channel}
                                        </p>
                                        {acceptance.suppliedByName ? (
                                            <p>
                                                {t("suppliedByName")}: {acceptance.suppliedByName}
                                            </p>
                                        ) : null}
                                        {acceptance.externalReference ? (
                                            <p>
                                                {t("externalReference")}:{" "}
                                                {acceptance.externalReference}
                                            </p>
                                        ) : null}
                                        {acceptance.withdrawnAt ? (
                                            <p>
                                                {t("acceptanceWithdrawn")}:{" "}
                                                {date(acceptance.withdrawnAt)} ·{" "}
                                                {acceptance.withdrawalReason}
                                            </p>
                                        ) : null}
                                    </div>
                                ))}
                        </li>
                    ))}
            </ol>
        </section>
    );
}
