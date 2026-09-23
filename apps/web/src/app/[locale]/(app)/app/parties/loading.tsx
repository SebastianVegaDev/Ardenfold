import { Skeleton } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";

export default async function PartiesLoading() {
    const t = await getTranslations("states");

    return (
        <div aria-busy="true" className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
            <span className="sr-only">{t("loading")}</span>
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
        </div>
    );
}
