import type { Locale } from "@/i18n/locales";
import { RequestCreateScreen } from "@/features/service-management/requests/create/request-create-screen";

export default async function NewServiceRequestPage({
    params,
}: Readonly<{ params: Promise<{ locale: Locale }> }>) {
    const { locale } = await params;
    return <RequestCreateScreen locale={locale} />;
}
