import { getTranslations } from "next-intl/server";

export async function RequestLoading() {
    const t = await getTranslations("serviceRequests");
    return (
        <div className="mx-auto max-w-6xl p-6 sm:p-8" role="status" aria-busy="true">
            <p>{t("loading")}</p>
            <div
                className="mt-4 h-8 w-64 animate-pulse rounded-control bg-surface-muted"
                aria-hidden="true"
            />
            <div
                className="mt-8 h-48 animate-pulse rounded-card bg-surface-muted"
                aria-hidden="true"
            />
        </div>
    );
}
