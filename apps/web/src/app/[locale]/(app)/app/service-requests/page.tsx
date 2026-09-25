import type { Locale } from "@/i18n/locales";
import { RequestsListScreen } from "@/features/service-management/requests/list/requests-list-screen";

type Props = Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ status?: string; cursor?: string; notice?: string }>;
}>;

export default async function ServiceRequestsPage({ params, searchParams }: Props) {
    const [{ locale }, query] = await Promise.all([params, searchParams]);
    return <RequestsListScreen locale={locale} query={query} />;
}
