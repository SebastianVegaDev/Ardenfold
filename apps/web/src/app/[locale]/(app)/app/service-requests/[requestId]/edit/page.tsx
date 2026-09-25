import type { Locale } from "@/i18n/locales";
import { RequestDetailScreen } from "@/features/service-management/requests/details/request-detail-screen";

export default async function EditServiceRequestPage({
    params,
}: Readonly<{ params: Promise<{ locale: Locale; requestId: string }> }>) {
    const { locale, requestId } = await params;
    return <RequestDetailScreen locale={locale} requestId={requestId} edit />;
}
