import type { Locale } from "@/i18n/locales";
import { WorkOrderDetailScreen } from "@/features/service-management/work-orders/details/work-order-detail-screen";

export default async function WorkOrderPage({
    params,
}: Readonly<{ params: Promise<{ locale: Locale; orderId: string }> }>) {
    const { locale, orderId } = await params;
    return <WorkOrderDetailScreen locale={locale} orderId={orderId} />;
}
