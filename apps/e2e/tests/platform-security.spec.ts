import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const webOrigin = "http://localhost:3000";
const apiOrigin = "http://127.0.0.1:3001";
const identityOrigin = "http://127.0.0.1:4010";

async function signIn(
    page: Page,
    identity: "user_e2e_owner" | "user_e2e_member" | "user_e2e_expiring",
): Promise<void> {
    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await expect(page.getByRole("heading", { name: "Test identity provider" })).toBeVisible();
    await page.getByTestId(identity).click();
    await expect(page).toHaveURL(/\/en\/app(?:\?|$)/u);
}

async function createOrganization(page: Page, name: string): Promise<void> {
    await page.goto("/en/app/onboarding");
    await page.getByLabel("Organization name").fill(name);
    await page.getByLabel("Default time zone").fill("America/Lima");
    await Promise.all([
        page.waitForResponse(
            (response) =>
                response.url().endsWith("/auth/organizations") &&
                response.request().method() === "POST",
        ),
        page.getByRole("button", { name: "Create organization" }).click(),
    ]);
    await expect(page).toHaveURL(/\/en\/app\?status=created$/u);
    await expect(page.getByLabel("Organization selector").locator("option", { hasText: name })).toHaveCount(1);
}

async function selectOrganization(page: Page, organizationId: string): Promise<void> {
    const selector = page.getByLabel("Organization selector");
    await Promise.all([
        page.waitForResponse(
            (response) =>
                response.url().includes("/auth/organization") &&
                response.request().method() === "POST",
        ),
        selector.selectOption(organizationId),
    ]);
    await expect(page.getByLabel("Organization selector")).toHaveValue(organizationId);
}

async function browserCookieHeader(context: BrowserContext): Promise<string> {
    return (await context.cookies(webOrigin))
        .map(({ name, value }) => `${name}=${value}`)
        .join("; ");
}

async function postFormOutsideTrace(
    context: BrowserContext,
    path: string,
    values: Record<string, string>,
): Promise<Response> {
    const response = await fetch(new URL(path, webOrigin), {
        method: "POST",
        redirect: "manual",
        headers: {
            cookie: await browserCookieHeader(context),
            "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(values),
    });

    for (const serializedCookie of response.headers.getSetCookie()) {
        const [pair] = serializedCookie.split(";", 1);
        if (!pair) continue;
        const separator = pair.indexOf("=");
        if (separator > 0) {
            await context.addCookies([
                {
                    name: pair.slice(0, separator),
                    value: pair.slice(separator + 1),
                    url: webOrigin,
                },
            ]);
        }
    }
    return response;
}

async function accessToken(identity: "user_e2e_member"): Promise<string> {
    const response = await fetch(`${identityOrigin}/test/access-token?identity=${identity}`);
    if (!response.ok)
        throw new Error("The test identity provider could not issue a security probe token.");
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== "string")
        throw new Error("The security probe token was malformed.");
    return body.access_token;
}

test.describe.serial("M1 platform security", () => {
    test("protects anonymous routes and completes real authentication", async ({ page }) => {
        await page.goto("/en/app");
        await expect(page).toHaveURL(/\/en\/sign-in$/u);
        await expect(page.getByRole("heading", { name: "Sign in to Ardenfold" })).toBeVisible();

        await signIn(page, "user_e2e_owner");
        await expect(page.getByText("Ada Owner")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Your workspace" })).toBeVisible();
    });

    test("enforces organizations, roles, tenant isolation and membership lifecycle", async ({
        browser,
    }) => {
        const ownerContext = await browser.newContext({ baseURL: webOrigin });
        const memberContext = await browser.newContext({ baseURL: webOrigin });
        const owner = await ownerContext.newPage();
        const member = await memberContext.newPage();

        try {
            await owner.goto("/en/sign-in");
            await signIn(owner, "user_e2e_owner");
            await createOrganization(owner, "North Archive");
            await createOrganization(owner, "South Archive");

            const selector = owner.getByLabel("Organization selector");
            const organizations = await selector.locator("option").evaluateAll((options) =>
                options.map((option) => ({
                    id: (option as HTMLOptionElement).value,
                    name: option.textContent?.trim() ?? "",
                })),
            );
            const north = organizations.find(
                (organization) => organization.name === "North Archive",
            );
            const south = organizations.find(
                (organization) => organization.name === "South Archive",
            );
            expect(north).toBeDefined();
            expect(south).toBeDefined();

            await selectOrganization(owner, north!.id);
            await selectOrganization(owner, south!.id);
            await selectOrganization(owner, north!.id);

            const invitation = await postFormOutsideTrace(
                ownerContext,
                "/auth/organization-management",
                {
                    intent: "create-invitation",
                    locale: "en",
                    email: "member@example.test",
                    role: "member",
                },
            );
            expect(invitation.status).toBe(200);
            const invitationBody = (await invitation.json()) as { acceptanceToken?: unknown };
            if (typeof invitationBody.acceptanceToken !== "string") {
                throw new Error("Invitation creation did not return a one-time credential.");
            }

            await member.goto("/en/sign-in");
            await signIn(member, "user_e2e_member");
            const acceptance = await postFormOutsideTrace(
                memberContext,
                "/auth/invitations/accept",
                {
                    locale: "en",
                    token: invitationBody.acceptanceToken,
                },
            );
            expect(acceptance.status).toBe(303);

            await member.goto("/en/app");
            await expect(member.getByLabel("Organization selector")).toHaveValue(north!.id);

            const restricted = await postFormOutsideTrace(
                memberContext,
                "/auth/organization-management",
                {
                    intent: "update-profile",
                    locale: "en",
                    name: "Unauthorized rename",
                    defaultLocale: "en",
                    defaultTimeZone: "UTC",
                },
            );
            expect(restricted.status).toBe(303);
            expect(restricted.headers.get("location")).toContain("status=error");

            const token = await accessToken("user_e2e_member");
            const crossTenant = await fetch(`${apiOrigin}/api/v1/organizations/current`, {
                headers: {
                    authorization: `Bearer ${token}`,
                    "x-ardenfold-organization-id": south!.id,
                },
            });
            expect(crossTenant.status).toBe(403);

            await owner.goto("/en/app/settings/organization");
            const memberCard = owner.locator("article").filter({ hasText: "member@example.test" });
            await memberCard.getByRole("button", { name: "Suspend" }).click();
            await expect(owner.getByRole("status")).toContainText("updated");

            await member.goto("/en/app");
            await expect(member.getByText("No organizations yet").first()).toBeVisible();
        } finally {
            await ownerContext.close();
            await memberContext.close();
        }
    });

    test("supports localized navigation, logout and terminal session expiry", async ({
        browser,
    }) => {
        const localizedContext = await browser.newContext({ baseURL: webOrigin });
        const localized = await localizedContext.newPage();
        try {
            await localized.goto("/en/sign-in");
            await signIn(localized, "user_e2e_owner");
            await localized.goto("/es/app");
            await expect(
                localized.getByRole("heading", { name: "Tu espacio de trabajo" }),
            ).toBeVisible();
            await expect(
                localized.getByRole("navigation", { name: "Navegación principal" }),
            ).toBeVisible();
            await localized.goto("/en/app");
            await expect(
                localized.getByRole("navigation", { name: "Primary navigation" }),
            ).toBeVisible();

            const logout = await postFormOutsideTrace(localizedContext, "/auth/sign-out?locale=en", {});
            expect([302, 303, 307, 308]).toContain(logout.status);
            const logoutLocation = logout.headers.get("location");
            if (!logoutLocation?.startsWith(`${identityOrigin}/user_management/sessions/logout`)) {
                throw new Error("Logout did not delegate session revocation to the identity provider.");
            }
            await localized.goto(logoutLocation);
            await expect(localized).toHaveURL(/\/en$/u);
            await localized.goto("/en/app");
            await expect(localized).toHaveURL(/\/en\/sign-in$/u);
        } finally {
            await localizedContext.close();
        }

        const expiringContext = await browser.newContext({ baseURL: webOrigin });
        const expiring = await expiringContext.newPage();
        try {
            await expiring.goto("/en/sign-in");
            await signIn(expiring, "user_e2e_expiring");
            await new Promise((resolve) => setTimeout(resolve, 9_000));
            await expiring.goto("/en/app");
            await expect(expiring).toHaveURL(/\/en\/sign-in$/u);
        } finally {
            await expiringContext.close();
        }
    });
});
