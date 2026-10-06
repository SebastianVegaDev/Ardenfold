"use client";

import { Button } from "@ardenfold/ui";
import {
    Building2,
    Boxes,
    House,
    LogOut,
    Menu,
    Settings,
    ClipboardList,
    FileText,
    BriefcaseBusiness,
    ListChecks,
    FlaskConical,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { OrganizationSummary } from "@ardenfold/contracts";

import { BrandLogo } from "./brand-logo";

export type AppShellCopy = Readonly<{
    brandAlt: string;
    skipToContent: string;
    openNavigation: string;
    closeNavigation: string;
    primaryNavigation: string;
    home: string;
    parties: string;
    assets: string;
    serviceRequests: string;
    quotations: string;
    workOrders: string;
    operations: string;
    technicalOperations: string;
    settings: string;
    organization: string;
    organizationPlaceholder: string;
    noOrganizations: string;
    account: string;
    signOut: string;
}>;

type AppShellProps = Readonly<{
    children: ReactNode;
    copy: AppShellCopy;
    homeHref: string;
    accountName: string;
    signOutHref: string;
    locale: string;
    organizations: readonly OrganizationSummary[];
    activeOrganizationId: string | undefined;
    onboardingHref: string;
    settingsHref: string;
    partiesHref?: string;
    canReadParties?: boolean;
    assetsHref?: string;
    canReadAssets?: boolean;
    serviceRequestsHref?: string;
    canReadServiceRequests?: boolean;
    quotationsHref?: string;
    canReadQuotations?: boolean;
    workOrdersHref?: string;
    canReadWorkOrders?: boolean;
    operationsHref?: string;
    canReadOperations?: boolean;
    technicalOperationsHref?: string;
    canReadTechnicalOperations?: boolean;
}>;

export function AppShell({
    accountName,
    activeOrganizationId,
    children,
    copy,
    homeHref,
    partiesHref,
    canReadParties = false,
    assetsHref,
    canReadAssets = false,
    serviceRequestsHref,
    canReadServiceRequests = false,
    quotationsHref,
    canReadQuotations = false,
    workOrdersHref,
    canReadWorkOrders = false,
    operationsHref,
    canReadOperations = false,
    technicalOperationsHref,
    canReadTechnicalOperations = false,
    locale,
    onboardingHref,
    organizations,
    settingsHref,
    signOutHref,
}: AppShellProps) {
    const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

    const navigation = (
        <nav aria-label={copy.primaryNavigation} className="flex flex-col gap-1 p-3">
            <Link
                className="flex h-11 items-center gap-3 rounded-control bg-secondary px-3 font-medium text-secondary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={homeHref}
                onClick={() => setMobileNavigationOpen(false)}
            >
                <House aria-hidden="true" className="size-5 shrink-0" />
                <span className="md:hidden lg:inline">{copy.home}</span>
            </Link>
            {canReadParties && partiesHref ? (
                <Link
                    className="flex h-11 items-center gap-3 rounded-control px-3 font-medium outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={partiesHref}
                    onClick={() => setMobileNavigationOpen(false)}
                >
                    <UsersRound aria-hidden="true" className="size-5 shrink-0" />
                    <span className="md:hidden lg:inline">{copy.parties}</span>
                </Link>
            ) : null}
            {canReadAssets && assetsHref ? (
                <Link
                    className="flex h-11 items-center gap-3 rounded-control px-3 font-medium outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={assetsHref}
                    onClick={() => setMobileNavigationOpen(false)}
                >
                    <Boxes aria-hidden="true" className="size-5 shrink-0" />
                    <span className="md:hidden lg:inline">{copy.assets}</span>
                </Link>
            ) : null}
            {canReadServiceRequests && serviceRequestsHref ? (
                <Link
                    className="flex h-11 items-center gap-3 rounded-control px-3 font-medium outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={serviceRequestsHref}
                    onClick={() => setMobileNavigationOpen(false)}
                >
                    <ClipboardList aria-hidden="true" className="size-5 shrink-0" />
                    <span className="md:hidden lg:inline">{copy.serviceRequests}</span>
                </Link>
            ) : null}
            {canReadQuotations && quotationsHref ? (
                <Link
                    className="flex h-11 items-center gap-3 rounded-control px-3 font-medium outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={quotationsHref}
                    onClick={() => setMobileNavigationOpen(false)}
                >
                    <FileText aria-hidden="true" className="size-5 shrink-0" />
                    <span className="md:hidden lg:inline">{copy.quotations}</span>
                </Link>
            ) : null}
            {canReadWorkOrders && workOrdersHref ? (
                <Link
                    className="flex h-11 items-center gap-3 rounded-control px-3 font-medium outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={workOrdersHref}
                    onClick={() => setMobileNavigationOpen(false)}
                >
                    <BriefcaseBusiness aria-hidden="true" className="size-5 shrink-0" />
                    <span className="md:hidden lg:inline">{copy.workOrders}</span>
                </Link>
            ) : null}
            {canReadOperations && operationsHref ? (
                <Link
                    className="flex h-11 items-center gap-3 rounded-control px-3 font-medium outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={operationsHref}
                    onClick={() => setMobileNavigationOpen(false)}
                >
                    <ListChecks aria-hidden="true" className="size-5 shrink-0" />
                    <span className="md:hidden lg:inline">{copy.operations}</span>
                </Link>
            ) : null}
            {canReadTechnicalOperations && technicalOperationsHref ? (
                <Link
                    className="flex h-11 items-center gap-3 rounded-control px-3 font-medium outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={technicalOperationsHref}
                    onClick={() => setMobileNavigationOpen(false)}
                >
                    <FlaskConical aria-hidden="true" className="size-5 shrink-0" />
                    <span className="md:hidden lg:inline">{copy.technicalOperations}</span>
                </Link>
            ) : null}
            {organizations.length > 0 ? (
                <Link
                    className="flex h-11 items-center gap-3 rounded-control px-3 font-medium outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={settingsHref}
                    onClick={() => setMobileNavigationOpen(false)}
                >
                    <Settings aria-hidden="true" className="size-5 shrink-0" />
                    <span className="md:hidden lg:inline">{copy.settings}</span>
                </Link>
            ) : (
                <Link
                    className="m-2 rounded-control bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
                    href={onboardingHref}
                >
                    {copy.noOrganizations}
                </Link>
            )}
        </nav>
    );

    return (
        <div className="min-h-screen bg-background text-foreground">
            <a
                className="sr-only z-[60] rounded-control bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
                href="#main-content"
            >
                {copy.skipToContent}
            </a>

            <header className="sticky top-0 z-40 flex h-16 items-center border-b border-border bg-surface/95 px-4 backdrop-blur md:pl-24 lg:pl-68">
                <Button
                    aria-expanded={mobileNavigationOpen}
                    aria-label={mobileNavigationOpen ? copy.closeNavigation : copy.openNavigation}
                    className="mr-3 md:hidden"
                    onClick={() => setMobileNavigationOpen((open) => !open)}
                    size="icon"
                    type="button"
                    variant="ghost"
                >
                    {mobileNavigationOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
                </Button>

                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 rounded-control px-2 py-1.5">
                        <Building2 aria-hidden="true" className="size-5 shrink-0 text-primary" />
                        {organizations.length === 0 ? (
                            <span className="truncate text-sm text-muted-foreground">
                                {copy.noOrganizations}
                            </span>
                        ) : (
                            <form action="/auth/organization" method="post">
                                <input name="locale" type="hidden" value={locale} />
                                <select
                                    aria-label={copy.organization}
                                    className="max-w-56 bg-transparent text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    defaultValue={activeOrganizationId}
                                    name="organizationId"
                                    onChange={(event) => event.currentTarget.form?.requestSubmit()}
                                    title={copy.organizationPlaceholder}
                                >
                                    {organizations.map((organization) => (
                                        <option key={organization.id} value={organization.id}>
                                            {organization.name}
                                        </option>
                                    ))}
                                </select>
                            </form>
                        )}
                    </div>

                    <div aria-label={copy.account} className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-full bg-secondary text-secondary-foreground">
                            <UserRound aria-hidden="true" className="size-4" />
                        </span>
                        <span className="hidden text-sm font-medium sm:inline">{accountName}</span>
                        <form action={signOutHref} method="post">
                            <Button
                                aria-label={copy.signOut}
                                size="icon"
                                type="submit"
                                variant="ghost"
                            >
                                <LogOut aria-hidden="true" />
                            </Button>
                        </form>
                    </div>
                </div>
            </header>

            <aside className="fixed inset-y-0 left-0 z-50 hidden w-20 flex-col border-r border-border bg-surface md:flex lg:w-64">
                <Link
                    className="flex h-16 items-center border-b border-border px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:px-5"
                    href={homeHref}
                >
                    <Image
                        alt={copy.brandAlt}
                        className="size-10 lg:hidden"
                        height="64"
                        priority
                        src="/brand/isotype-color.svg"
                        width="64"
                    />
                    <BrandLogo alt={copy.brandAlt} className="hidden h-auto w-40 lg:block" />
                </Link>
                {navigation}
            </aside>

            {mobileNavigationOpen ? (
                <div className="fixed inset-0 z-30 md:hidden">
                    <button
                        aria-label={copy.closeNavigation}
                        className="absolute inset-0 bg-night-ink/50"
                        onClick={() => setMobileNavigationOpen(false)}
                        type="button"
                    />
                    <aside className="absolute inset-y-16 left-0 w-72 border-r border-border bg-surface shadow-dialog">
                        {navigation}
                    </aside>
                </div>
            ) : null}

            <main className="md:pl-20 lg:pl-64" id="main-content" tabIndex={-1}>
                {children}
            </main>
        </div>
    );
}
