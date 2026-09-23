import type { Locale } from "@/i18n/locales";

export function PartyFormFields({
    locale,
    partyId,
    version,
    intent,
}: Readonly<{
    locale: Locale;
    partyId: string;
    version: number;
    intent: string;
}>) {
    return (
        <>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="partyId" value={partyId} />
            <input type="hidden" name="expectedVersion" value={version} />
            <input type="hidden" name="intent" value={intent} />
        </>
    );
}
