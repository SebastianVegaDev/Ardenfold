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
    organization: "Organization",
    organizationPlaceholder: "Select organization",
    account: "Account",
    accountPlaceholder: "User",
};

describe("AppShell", () => {
    it("provides landmark labels, a skip link and consumer-owned copy", () => {
        render(
            <AppShell copy={copy} homeHref="/en/app">
                <h1>Workspace</h1>
            </AppShell>,
        );

        expect(screen.getByRole("link", { name: "Skip" })).toHaveAttribute("href", "#main-content");
        expect(screen.getAllByRole("navigation", { name: "Primary navigation" })).toHaveLength(1);
        expect(screen.getByRole("main")).toHaveTextContent("Workspace");
        expect(screen.getByRole("button", { name: "Organization" })).toBeInTheDocument();
    });

    it("opens and closes mobile navigation without changing focus order", () => {
        render(
            <AppShell copy={copy} homeHref="/en/app">
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
