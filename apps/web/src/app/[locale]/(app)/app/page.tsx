import { getTranslations } from "next-intl/server";

export default async function WorkspacePage() {
    const translate = await getTranslations("workspace");

    return (
        <section className="mx-auto max-w-5xl p-6 sm:p-8">
            <h1 className="font-display text-3xl font-semibold">{translate("title")}</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">{translate("description")}</p>
        </section>
    );
}
