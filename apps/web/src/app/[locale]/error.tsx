"use client";

import { Alert, AlertDescription, AlertTitle, Button } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

type ErrorPageProps = Readonly<{
    error: Error & { digest?: string };
    reset: () => void;
}>;

export default function ErrorPage({ error, reset }: ErrorPageProps) {
    const translate = useTranslations("states.error");

    useEffect(() => {
        // The error boundary deliberately avoids rendering exception details.
        console.error(error);
    }, [error]);

    return (
        <main className="mx-auto grid min-h-96 max-w-2xl place-items-center p-6">
            <Alert variant="destructive">
                <AlertTitle>{translate("title")}</AlertTitle>
                <AlertDescription>{translate("description")}</AlertDescription>
                <Button className="mt-4" onClick={reset} type="button" variant="outline">
                    {translate("action")}
                </Button>
            </Alert>
        </main>
    );
}
