import type { Locale } from "@/i18n/locales";
import { RequestDetailScreen } from "@/features/service-management/requests/details/request-detail-screen";

type Props = Readonly<{
    params: Promise<{ locale: Locale; requestId: string }>;
    searchParams: Promise<{ notice?: string }>;
}>;

export default async function ServiceRequestDetailPage({ params, searchParams }: Props) {
    const [{ locale, requestId }, { notice }] = await Promise.all([params, searchParams]);
    return <RequestDetailScreen locale={locale} requestId={requestId} notice={notice} />;
}
