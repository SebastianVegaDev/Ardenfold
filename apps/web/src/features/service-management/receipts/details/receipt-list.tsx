import type {
    AssetCurrentRelationships,
    ReceiptDetail,
    WorkOrderDetail,
} from "@ardenfold/contracts";
import { useTranslations } from "next-intl";
import Link from "next/link";

import type { Locale } from "@/i18n/locales";

type Receipt = Omit<ReceiptDetail, "corrections">;
type Props = Readonly<{
    locale: Locale;
    order: WorkOrderDetail;
    receipts: Receipt[];
    assets: Record<string, { name: string | null; current: AssetCurrentRelationships | null }>;
}>;

export function ReceiptList({ locale, order, receipts, assets }: Props) {
    const t = useTranslations("receipts");
    const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    return (
        <section className="space-y-4" aria-labelledby="order-receipts-heading">
            <h2 id="order-receipts-heading" className="font-display text-2xl font-semibold">
                {t("title")}
            </h2>
            {receipts.length ? (
                <ul className="grid gap-3">
                    {receipts.map((receipt) => {
                        const asset = receipt.assetId ? assets[receipt.assetId] : null;
                        const custody = asset?.current?.custody;
                        const location = asset?.current?.location;
                        return (
                            <li
                                key={receipt.id}
                                className="space-y-2 rounded-card border border-border bg-surface p-4"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Link
                                        className="font-semibold text-primary underline"
                                        href={`/${locale}/app/receipts/${receipt.id}`}
                                    >
                                        {t("receiptAt", {
                                            date: format.format(new Date(receipt.receivedAt)),
                                        })}
                                    </Link>
                                    <span className="text-sm text-muted-foreground">
                                        {receipt.voidedAt
                                            ? t("voided")
                                            : t(`custodyStatuses.${receipt.custodyStatus}`)}
                                    </span>
                                </div>
                                <p>{receipt.intakeDescription}</p>
                                <p className="text-sm">
                                    {t("condition")}: {receipt.observedCondition}
                                </p>
                                <p className="text-sm">
                                    {t("items")}:{" "}
                                    {receipt.itemIds
                                        .map(
                                            (id) =>
                                                order.items.find((item) => item.id === id)
                                                    ?.itemNumber ?? id,
                                        )
                                        .join(", ")}
                                </p>
                                {receipt.assetId ? (
                                    <p className="text-sm">
                                        {t("asset")}:{" "}
                                        <Link
                                            className="text-primary underline"
                                            href={`/${locale}/app/assets/${receipt.assetId}`}
                                        >
                                            {asset?.name ?? receipt.assetId}
                                        </Link>
                                    </p>
                                ) : (
                                    <p className="text-sm">{t("assetPending")}</p>
                                )}
                                {receipt.assetId && asset?.current ? (
                                    <div
                                        className="rounded-control border border-border p-3 text-sm"
                                        aria-label={t("registryState")}
                                    >
                                        <p className="font-semibold">{t("registryState")}</p>
                                        <p>
                                            {t("custody")}:{" "}
                                            {custody
                                                ? t(`targets.${custody.subject}`, {
                                                      value:
                                                          custody.locationDescription ??
                                                          custody.partyId ??
                                                          custody.siteId ??
                                                          custody.partyAddressId ??
                                                          "",
                                                  })
                                                : t("notRecorded")}
                                        </p>
                                        <p>
                                            {t("location")}:{" "}
                                            {location
                                                ? t(`targets.${location.subject}`, {
                                                      value:
                                                          location.locationDescription ??
                                                          location.siteId ??
                                                          location.partyId ??
                                                          location.partyAddressId ??
                                                          "",
                                                  })
                                                : t("notRecorded")}
                                        </p>
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="rounded-card border border-border bg-surface p-5">{t("empty")}</p>
            )}
        </section>
    );
}
