import type { Locale } from "@/i18n/locales";
import { WorkOrderCreateScreen } from "@/features/service-management/work-orders/create/work-order-create-screen";

export default async function NewWorkOrderPage({
    params,
    searchParams,
}: Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ quoteId?: string }>;
}>) {
    const [{ locale }, { quoteId }] = await Promise.all([params, searchParams]);
    return <WorkOrderCreateScreen locale={locale} quoteId={quoteId ?? ""} />;
}
