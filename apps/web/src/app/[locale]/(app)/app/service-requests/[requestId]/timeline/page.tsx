import { RequestTimelineScreen } from "@/features/service-management/operations/timeline/request-timeline-screen";
import type { Locale } from "@/i18n/locales";

export default async function ServiceRequestTimelinePage({
    params,
    searchParams,
}: Readonly<{
    params: Promise<{ locale: Locale; requestId: string }>;
    searchParams: Promise<{ cursor?: string }>;
}>) {
    const [{ locale, requestId }, query] = await Promise.all([params, searchParams]);
    return (
        <RequestTimelineScreen
            locale={locale}
            requestId={requestId}
            {...(query.cursor ? { cursor: query.cursor } : {})}
        />
    );
}
