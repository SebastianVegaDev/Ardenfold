import type { Locale } from "@/i18n/locales";
import { QuoteDetailScreen } from "@/features/service-management/quotations/details/quote-detail-screen";

export default async function QuotationDetailPage({
    params,
    searchParams,
}: Readonly<{
    params: Promise<{ locale: Locale; quoteId: string }>;
    searchParams: Promise<{ notice?: string }>;
}>) {
    const [{ locale, quoteId }, { notice }] = await Promise.all([params, searchParams]);
    return <QuoteDetailScreen locale={locale} quoteId={quoteId} notice={notice} />;
}
