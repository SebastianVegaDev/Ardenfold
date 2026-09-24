import type { Locale } from "@/i18n/locales";

type Props = Readonly<{
    locale: Locale;
    assetId: string;
    version: number;
    intent: string;
}>;

export function AssetFormFields({ locale, assetId, version, intent }: Props) {
    return (
        <>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="assetId" value={assetId} />
            <input type="hidden" name="expectedVersion" value={version} />
            <input type="hidden" name="intent" value={intent} />
        </>
    );
}
