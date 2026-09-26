import { identifierSchema } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { getAsset, getCurrentRelationships } from "@/features/assets/api-client";
import { getWorkOrder } from "@/features/service-management/work-orders/api/work-order-api";
import type { Locale } from "@/i18n/locales";

import { getReceipt, ReceiptApiError } from "../api/receipt-api";
import { ReceiptCorrectionForm } from "./receipt-correction-form";

export async function ReceiptDetailScreen({
    locale,
    receiptId,
}: Readonly<{ locale: Locale; receiptId: string }>) {
    if (!identifierSchema.safeParse(receiptId).success) notFound();
    const t = await getTranslations("receipts");
    const { session, organization } = await getActiveOrganizationSession();
    const active = await getActiveOrganization(session.accessToken, organization.id);
    if (!active.permissions.includes("receipts.read"))
        return (
            <p role="alert" className="mx-auto max-w-5xl p-6">
                {t("forbidden")}
            </p>
        );
    let receipt;
    try {
        receipt = await getReceipt(session.accessToken, organization.id, receiptId);
    } catch (error) {
        if (error instanceof ReceiptApiError && error.status === 404) notFound();
        return (
            <p role="alert" className="mx-auto max-w-5xl p-6">
                {t("loadError")}
            </p>
        );
    }
    const token = session.accessToken;
    const tenant = organization.id;
    const [order, asset, current] = await Promise.all([
        active.permissions.includes("work_orders.read")
            ? getWorkOrder(token, tenant, receipt.workOrderId).catch(() => null)
            : Promise.resolve(null),
        receipt.assetId && active.permissions.includes("assets.read")
            ? getAsset(token, tenant, receipt.assetId).catch(() => null)
            : Promise.resolve(null),
        receipt.assetId && active.permissions.includes("assets.read")
            ? getCurrentRelationships(token, tenant, receipt.assetId).catch(() => null)
            : Promise.resolve(null),
    ]);
    const format = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: active.defaultTimeZone,
    });
    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
            <Link
                className="text-primary underline"
                href={`/${locale}/app/work-orders/${receipt.workOrderId}`}
            >
                {t("backToOrder")}
            </Link>
            <header>
                <h1 className="font-display text-3xl font-semibold">
                    {t("receiptAt", { date: format.format(new Date(receipt.receivedAt)) })}
                </h1>
                <p className="mt-2 text-muted-foreground">
                    {receipt.voidedAt ? t("voided") : t(`custodyStatuses.${receipt.custodyStatus}`)}{" "}
                    · {t("version", { version: receipt.version })}
                </p>
            </header>
            <section
                className="space-y-3 rounded-card border border-border bg-surface p-5"
                aria-labelledby="receipt-facts-heading"
            >
                <h2 id="receipt-facts-heading" className="font-display text-xl font-semibold">
                    {t("intakeFacts")}
                </h2>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="font-semibold">{t("intakeDescription")}</dt>
                        <dd className="whitespace-pre-wrap">{receipt.intakeDescription}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">{t("condition")}</dt>
                        <dd className="whitespace-pre-wrap">{receipt.observedCondition}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">{t("responsibleActor")}</dt>
                        <dd>{receipt.responsibleActorName}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">{t("items")}</dt>
                        <dd>
                            {receipt.itemIds
                                .map(
                                    (id) =>
                                        order?.items.find((item) => item.id === id)?.itemNumber ??
                                        id,
                                )
                                .join(", ")}
                        </dd>
                    </div>
                </dl>
                <div>
                    <h3 className="font-semibold">{t("accessories")}</h3>
                    {receipt.accessories.length ? (
                        <ul className="list-disc pl-5">
                            {receipt.accessories.map((value, index) => (
                                <li key={index}>{value}</li>
                            ))}
                        </ul>
                    ) : (
                        <p>{t("noneRecorded")}</p>
                    )}
                </div>
                {receipt.assetId ? (
                    <p>
                        {t("asset")}:{" "}
                        <Link
                            className="text-primary underline"
                            href={`/${locale}/app/assets/${receipt.assetId}`}
                        >
                            {asset?.displayName ?? receipt.assetId}
                        </Link>
                    </p>
                ) : (
                    <p>{t("assetPending")}</p>
                )}
            </section>
            {receipt.assetId && current ? (
                <section
                    className="space-y-2 rounded-card border border-border bg-surface p-5"
                    aria-labelledby="registry-heading"
                >
                    <h2 id="registry-heading" className="font-display text-xl font-semibold">
                        {t("registryState")}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t("registryAuthorityHint")}</p>
                    <p>
                        {t("custody")}:{" "}
                        {current.custody
                            ? t(`targets.${current.custody.subject}`, {
                                  value:
                                      current.custody.locationDescription ??
                                      current.custody.partyId ??
                                      current.custody.siteId ??
                                      current.custody.partyAddressId ??
                                      "",
                              })
                            : t("notRecorded")}
                    </p>
                    <p>
                        {t("location")}:{" "}
                        {current.location
                            ? t(`targets.${current.location.subject}`, {
                                  value:
                                      current.location.locationDescription ??
                                      current.location.siteId ??
                                      current.location.partyId ??
                                      current.location.partyAddressId ??
                                      "",
                              })
                            : t("notRecorded")}
                    </p>
                </section>
            ) : null}
            {receipt.corrections.length ? (
                <section className="space-y-3" aria-labelledby="corrections-heading">
                    <h2 id="corrections-heading" className="font-display text-xl font-semibold">
                        {t("corrections")}
                    </h2>
                    <ol className="space-y-2">
                        {receipt.corrections.map((entry) => (
                            <li
                                key={entry.id}
                                className="rounded-control border border-border bg-surface p-3"
                            >
                                {t(`correctionKinds.${entry.kind}`)} ·{" "}
                                {format.format(new Date(entry.correctedAt))} · {entry.reason}
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null}
            {order &&
            active.permissions.includes("receipts.write") &&
            active.permissions.includes("work_orders.write") &&
            active.permissions.includes("assets.read") &&
            active.permissions.includes("parties.read") &&
            !receipt.voidedAt ? (
                <ReceiptCorrectionForm
                    receipt={receipt}
                    order={order}
                    current={current}
                    canCoordinate={active.permissions.includes("assets.manage_relationships")}
                />
            ) : null}
        </div>
    );
}
