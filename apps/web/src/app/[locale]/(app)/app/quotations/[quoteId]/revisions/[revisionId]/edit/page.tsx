import type { Locale } from "@/i18n/locales";
import { QuoteDetailScreen } from "@/features/service-management/quotations/details/quote-detail-screen";

export default async function EditQuotationRevisionPage({
    params,
}: Readonly<{ params: Promise<{ locale: Locale; quoteId: string; revisionId: string }> }>) {
    const { locale, quoteId, revisionId } = await params;
    return <QuoteDetailScreen locale={locale} quoteId={quoteId} editRevisionId={revisionId} />;
}
