import type { Locale } from "@/i18n/locales";
import { QuoteCreateScreen } from "@/features/service-management/quotations/create/quote-create-screen";

export default async function NewQuotationPage({
    params,
    searchParams,
}: Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ requestId?: string }>;
}>) {
    const [{ locale }, { requestId }] = await Promise.all([params, searchParams]);
    return <QuoteCreateScreen locale={locale} requestId={requestId ?? ""} />;
}
