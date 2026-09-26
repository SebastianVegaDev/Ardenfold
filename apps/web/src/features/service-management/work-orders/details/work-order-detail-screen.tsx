import { identifierSchema, type AssetCurrentRelationships } from "@ardenfold/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveOrganization } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import {
    getAsset,
    getCurrentRelationships,
    listAvailableSites,
} from "@/features/assets/api-client";
import { getQuote } from "@/features/service-management/quotations/api/quote-api";
import { getServiceRequest } from "@/features/service-management/requests/api/request-api";
import { listReceipts } from "@/features/service-management/receipts/api/receipt-api";
import { ReceiptList } from "@/features/service-management/receipts/details/receipt-list";
import { ReceiptIntake } from "@/features/service-management/receipts/intake/receipt-intake";
import type { Locale } from "@/i18n/locales";

import { getWorkOrder, getWorkOrderReadiness, WorkOrderApiError } from "../api/work-order-api";
import { WorkOrderOperations } from "../work-items/work-order-operations";

export async function WorkOrderDetailScreen({
    locale,
    orderId,
}: Readonly<{ locale: Locale; orderId: string }>) {
    if (!identifierSchema.safeParse(orderId).success) notFound();
    const t = await getTranslations("workOrders");
    const { session, organization } = await getActiveOrganizationSession();
    const active = await getActiveOrganization(session.accessToken, organization.id);
    if (!active.permissions.includes("work_orders.read"))
        return (
            <p role="alert" className="mx-auto max-w-6xl p-6">
                {t("forbidden")}
            </p>
        );
    let order;
    try {
        order = await getWorkOrder(session.accessToken, organization.id, orderId);
    } catch (error) {
        if (error instanceof WorkOrderApiError && error.status === 404) notFound();
        return (
            <p role="alert" className="mx-auto max-w-6xl p-6">
                {t("loadError")}
            </p>
        );
    }
    const token = session.accessToken;
    const tenant = organization.id;
    const [quote, request, receipts, sites, readiness] = await Promise.all([
        active.permissions.includes("quotations.read")
            ? getQuote(token, tenant, order.quoteId).catch(() => null)
            : Promise.resolve(null),
        active.permissions.includes("service_requests.read")
            ? getServiceRequest(token, tenant, order.requestId).catch(() => null)
            : Promise.resolve(null),
        active.permissions.includes("receipts.read")
            ? listReceipts(token, tenant, order.id)
                  .then((result) => result.data)
                  .catch(() => null)
            : Promise.resolve(null),
        active.permissions.includes("sites.read")
            ? listAvailableSites(token, tenant)
                  .then((result) => result.data)
                  .catch(() => [])
            : Promise.resolve([]),
        (["sites.read", "parties.read", "assets.read", "receipts.read"] as const).every(
            (permission) => active.permissions.includes(permission),
        )
            ? getWorkOrderReadiness(token, tenant, order.id)
                  .then((result) => result.data)
                  .catch(() => null)
            : Promise.resolve(null),
    ]);
    const ids = [
        ...new Set(
            order.items.map((item) => item.assetId).filter((id): id is string => Boolean(id)),
        ),
    ];
    const assetEntries = active.permissions.includes("assets.read")
        ? await Promise.all(
              ids.map(async (id) => {
                  const [asset, current] = await Promise.all([
                      getAsset(token, tenant, id).catch(() => null),
                      getCurrentRelationships(token, tenant, id).catch(() => null),
                  ]);
                  return [id, { name: asset?.displayName ?? null, current }] as const;
              }),
          )
        : [];
    const assets: Record<
        string,
        { name: string | null; current: AssetCurrentRelationships | null }
    > = Object.fromEntries(assetEntries);
    const acceptedRevision = quote?.revisions.find(
        (revision) => revision.id === order.acceptedRevisionId,
    );
    const format = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: active.defaultTimeZone,
    });
    return (
        <div className="mx-auto max-w-6xl space-y-7 p-6 sm:p-8">
            <Link className="text-primary underline" href={`/${locale}/app/work-orders`}>
                {t("back")}
            </Link>
            <header>
                <h1 className="font-display text-3xl font-semibold">{order.reference}</h1>
                <p className="mt-2 text-muted-foreground">
                    {t(`statuses.${order.status}`)} · {t("version", { version: order.version })}
                </p>
            </header>
            <section
                className="space-y-3 rounded-card border border-border bg-surface p-5"
                aria-labelledby="order-basis-heading"
            >
                <h2 id="order-basis-heading" className="font-display text-xl font-semibold">
                    {t("commercialBasis")}
                </h2>
                <p>{t("basisReadOnly")}</p>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="font-semibold">{t("quote")}</dt>
                        <dd>{quote?.reference ?? order.quoteId}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">{t("request")}</dt>
                        <dd>{request?.summary ?? order.requestId}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">{t("acceptedRevisionLabel")}</dt>
                        <dd>
                            {acceptedRevision
                                ? t("acceptedRevision", { number: acceptedRevision.revisionNumber })
                                : order.acceptedRevisionId}
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold">{t("site")}</dt>
                        <dd>
                            {sites.find((site) => site.id === order.siteId)?.name ?? order.siteId}
                        </dd>
                    </div>
                </dl>
                {acceptedRevision ? (
                    <ul className="space-y-2 border-t border-border pt-3">
                        {acceptedRevision.lines.map((line) => (
                            <li key={line.id}>
                                {line.description} · {line.quantity} {line.unit}
                            </li>
                        ))}
                    </ul>
                ) : null}
                <div className="flex flex-wrap gap-4">
                    {quote ? (
                        <Link
                            className="text-primary underline"
                            href={`/${locale}/app/quotations/${order.quoteId}`}
                        >
                            {t("viewQuote")}
                        </Link>
                    ) : null}
                    {request ? (
                        <Link
                            className="text-primary underline"
                            href={`/${locale}/app/service-requests/${order.requestId}`}
                        >
                            {t("viewRequest")}
                        </Link>
                    ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                    {t("authorizedAt")}: {format.format(new Date(order.createdAt))}
                </p>
            </section>
            <WorkOrderOperations
                locale={locale}
                order={order}
                assets={assets}
                sites={sites.filter((site) => site.isActive)}
                readiness={readiness}
                fixedAssets={Object.fromEntries(
                    acceptedRevision?.lines.map((line) => [line.id, line.assetId ?? null]) ?? [],
                )}
                canWrite={active.permissions.includes("work_orders.write")}
                canReadAssets={active.permissions.includes("assets.read")}
            />
            {receipts ? (
                <ReceiptList locale={locale} receipts={receipts} order={order} assets={assets} />
            ) : null}
            {active.permissions.includes("receipts.write") &&
            active.permissions.includes("receipts.read") &&
            active.permissions.includes("work_orders.write") &&
            active.permissions.includes("assets.read") &&
            active.permissions.includes("parties.read") &&
            order.status !== "cancelled" ? (
                <ReceiptIntake
                    locale={locale}
                    order={order}
                    assets={assets}
                    siteName={sites.find((site) => site.id === order.siteId)?.name ?? ""}
                    canCoordinate={active.permissions.includes("assets.manage_relationships")}
                />
            ) : null}
        </div>
    );
}
