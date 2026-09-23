import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell, type AppShellCopy } from "./app-shell";

const copy: AppShellCopy = {
    brandAlt: "Brand",
    skipToContent: "Skip",
    openNavigation: "Open navigation",
    closeNavigation: "Close navigation",
    primaryNavigation: "Primary navigation",
    home: "Home",
    parties: "Parties",
    settings: "Settings",
    organization: "Organization",
    organizationPlaceholder: "Select organization",
    noOrganizations: "No organizations",
    account: "Account",
    signOut: "Sign out",
};

describe("AppShell", () => {
    const organizations = [
        {
            id: "00000000-0000-4000-8000-000000000010",
            name: "North",
            defaultLocale: "en",
            defaultTimeZone: "UTC",
            role: "owner" as const,
        },
    ];

    it("provides landmark labels, a skip link and consumer-owned copy", () => {
        render(
            <AppShell
                accountName="Ada"
                activeOrganizationId={organizations[0]!.id}
                copy={copy}
                homeHref="/en/app"
                partiesHref="/en/app/parties"
                canReadParties
                locale="en"
                onboardingHref="/en/app/onboarding"
                organizations={organizations}
                settingsHref="/en/app/settings/organization"
                signOutHref="/auth/sign-out"
            >
                <h1>Workspace</h1>
            </AppShell>,
        );

        expect(screen.getByRole("link", { name: "Skip" })).toHaveAttribute("href", "#main-content");
        expect(screen.getAllByRole("navigation", { name: "Primary navigation" })).toHaveLength(1);
        expect(screen.getByRole("main")).toHaveTextContent("Workspace");
        expect(screen.getByRole("combobox", { name: "Organization" })).toHaveValue(
            organizations[0]!.id,
        );
        expect(screen.getByText("Ada")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Parties" })).toHaveAttribute(
            "href",
            "/en/app/parties",
        );
        expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    });

    it("opens and closes mobile navigation without changing focus order", () => {
        render(
            <AppShell
                accountName="Ada"
                activeOrganizationId={organizations[0]!.id}
                copy={copy}
                homeHref="/en/app"
                locale="en"
                onboardingHref="/en/app/onboarding"
                organizations={organizations}
                settingsHref="/en/app/settings/organization"
                signOutHref="/auth/sign-out"
            >
                <p>Content</p>
            </AppShell>,
        );

        fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

        expect(screen.getAllByRole("button", { name: "Close navigation" })[0]).toHaveAttribute(
            "aria-expanded",
            "true",
        );
        expect(screen.getAllByRole("navigation", { name: "Primary navigation" })).toHaveLength(2);

        fireEvent.click(screen.getAllByRole("button", { name: "Close navigation" })[1]!);

        expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
            "aria-expanded",
            "false",
        );
    });
});
