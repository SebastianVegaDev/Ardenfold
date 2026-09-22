import { Button, Input, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/locales";

type OnboardingPageProps = Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ status?: string }>;
}>;

export default async function OnboardingPage({ params, searchParams }: OnboardingPageProps) {
    const [{ locale }, query, translate] = await Promise.all([
        params,
        searchParams,
        getTranslations("onboarding"),
    ]);

    return (
        <section className="mx-auto max-w-2xl p-6 sm:p-8">
            <h1 className="font-display text-3xl font-semibold">{translate("title")}</h1>
            <p className="mt-2 text-muted-foreground">{translate("description")}</p>
            {query.status ? (
                <p className="mt-5 text-sm text-destructive" role="alert">
                    {translate("error")}
                </p>
            ) : null}
            <form
                action="/auth/organizations"
                className="mt-8 grid gap-5 rounded-card border border-border bg-surface p-6"
                method="post"
            >
                <input name="locale" type="hidden" value={locale} />
                <div>
                    <Label htmlFor="organization-name">{translate("name")}</Label>
                    <Input id="organization-name" maxLength={200} name="name" required />
                </div>
                <div>
                    <Label htmlFor="organization-locale">{translate("locale")}</Label>
                    <select
                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                        defaultValue={locale}
                        id="organization-locale"
                        name="defaultLocale"
                    >
                        <option value="en">English</option>
                        <option value="es">Español</option>
                    </select>
                </div>
                <div>
                    <Label htmlFor="organization-time-zone">{translate("timeZone")}</Label>
                    <Input
                        defaultValue="UTC"
                        id="organization-time-zone"
                        name="defaultTimeZone"
                        required
                    />
                </div>
                <Button type="submit">{translate("create")}</Button>
            </form>
        </section>
    );
}
