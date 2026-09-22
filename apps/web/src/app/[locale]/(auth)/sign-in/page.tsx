import { Button } from "@ardenfold/ui";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import type { Locale } from "@/i18n/locales";

type SignInPageProps = Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ error?: string }>;
}>;

export default async function SignInPage({ params, searchParams }: SignInPageProps) {
    const [{ locale }, query, session, translate] = await Promise.all([
        params,
        searchParams,
        withAuth(),
        getTranslations("auth.signIn"),
    ]);

    if (session.user) {
        redirect(`/${locale}/app`);
    }

    return (
        <section aria-labelledby="sign-in-title">
            <h1 className="font-display text-3xl font-semibold tracking-tight" id="sign-in-title">
                {translate("title")}
            </h1>
            <p className="mt-3 text-muted-foreground">{translate("description")}</p>
            {query.error ? (
                <p className="mt-6 rounded-control border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
                    {translate("callbackError")}
                </p>
            ) : null}
            <Button asChild className="mt-8 w-full" size="lg">
                <Link href={`/auth/sign-in?locale=${locale}`}>{translate("action")}</Link>
            </Button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
                {translate("securityNote")}
            </p>
        </section>
    );
}
