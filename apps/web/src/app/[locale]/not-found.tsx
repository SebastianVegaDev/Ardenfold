import { Button } from "@ardenfold/ui";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function NotFound() {
    const [locale, translate] = await Promise.all([
        getLocale(),
        getTranslations("states.notFound"),
    ]);

    return (
        <main className="grid min-h-screen place-items-center p-6">
            <div className="max-w-md text-center">
                <p className="font-mono text-sm text-primary">404</p>
                <h1 className="mt-3 font-display text-3xl font-semibold">{translate("title")}</h1>
                <p className="mt-3 text-muted-foreground">{translate("description")}</p>
                <Button asChild className="mt-6">
                    <Link href={`/${locale}`}>{translate("action")}</Link>
                </Button>
            </div>
        </main>
    );
}
