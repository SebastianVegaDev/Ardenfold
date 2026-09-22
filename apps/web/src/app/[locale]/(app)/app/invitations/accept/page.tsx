import { Button, Input } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/locales";

type AcceptPageProps = Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ token?: string; status?: string }>;
}>;

export default async function AcceptInvitationPage({ params, searchParams }: AcceptPageProps) {
    const [{ locale }, query, translate] = await Promise.all([
        params,
        searchParams,
        getTranslations("invitations.accept"),
    ]);

    return (
        <section className="mx-auto max-w-xl p-6 sm:p-8">
            <h1 className="font-display text-3xl font-semibold">{translate("title")}</h1>
            <p className="mt-2 text-muted-foreground">{translate("description")}</p>
            {query.status ? <p className="mt-5 text-sm text-destructive" role="alert">{translate("error")}</p> : null}
            <form action="/auth/invitations/accept" className="mt-8 space-y-4" method="post">
                <input name="locale" type="hidden" value={locale} />
                <Input defaultValue={query.token ?? ""} name="token" placeholder={translate("token")} readOnly={Boolean(query.token)} required />
                <Button type="submit">{translate("action")}</Button>
            </form>
        </section>
    );
}
