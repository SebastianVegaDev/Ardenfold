import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";

export default function AuthenticationLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(28rem,42rem)]">
            <div aria-hidden="true" className="hidden bg-deep-trace lg:block" />
            <main className="flex flex-col bg-background p-6 sm:p-10">
                <BrandLogo alt="" className="h-auto w-44" />
                <div className="m-auto w-full max-w-md">{children}</div>
            </main>
        </div>
    );
}
