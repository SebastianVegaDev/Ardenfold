import { getTranslations } from "next-intl/server";

type WorkspacePageProps = Readonly<{
    searchParams: Promise<{ organization?: string }>;
}>;

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
    const query = await searchParams;
    const translate = await getTranslations("workspace");

    return (
        <section className="mx-auto max-w-5xl p-6 sm:p-8">
            <h1 className="font-display text-3xl font-semibold">{translate("title")}</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">{translate("description")}</p>
            {query.organization ? (
                <p className="mt-6 rounded-control border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
                    {translate("organizationAccessDenied")}
                </p>
            ) : null}
        </section>
    );
}
