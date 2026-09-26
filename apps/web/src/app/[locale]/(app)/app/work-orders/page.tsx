import type { Locale } from "@/i18n/locales";
import { WorkOrdersListScreen } from "@/features/service-management/work-orders/list/work-orders-list-screen";

export default async function WorkOrdersPage({
    params,
    searchParams,
}: Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ status?: string; cursor?: string }>;
}>) {
    const [{ locale }, query] = await Promise.all([params, searchParams]);
    return <WorkOrdersListScreen locale={locale} query={query} />;
}
