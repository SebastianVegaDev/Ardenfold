import type { Locale } from "@/i18n/locales";
import { QuotesListScreen } from "@/features/service-management/quotations/list/quotes-list-screen";

export default async function QuotationsPage({
    params,
    searchParams,
}: Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ status?: string; cursor?: string; q?: string; sort?: string }>;
}>) {
    const [{ locale }, query] = await Promise.all([params, searchParams]);
    return <QuotesListScreen locale={locale} query={query} />;
}
