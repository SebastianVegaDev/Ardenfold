"use client";

import { Spinner } from "@ardenfold/ui";
import { useTranslations } from "next-intl";

export default function Loading() {
    const translate = useTranslations("states");

    return (
        <div className="grid min-h-64 place-items-center" role="presentation">
            <Spinner label={translate("loading")} />
        </div>
    );
}
