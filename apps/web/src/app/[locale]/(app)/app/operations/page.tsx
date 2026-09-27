import { OperationalQueuesScreen } from "@/features/service-management/operations/queues/operational-queues-screen";
import type { Locale } from "@/i18n/locales";

export default async function OperationsPage({
    params,
    searchParams,
}: Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ kind?: string; cursor?: string }>;
}>) {
    const [{ locale }, query] = await Promise.all([params, searchParams]);
    return <OperationalQueuesScreen locale={locale} query={query} />;
}
