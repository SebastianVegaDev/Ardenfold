import { expect, test } from "@playwright/test";

test("service request intake supports uncertain assets, recoverable edits and localized terminal state", async ({
    page,
}) => {
    test.setTimeout(90_000);
    await page.goto("/en/sign-in");
    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await page.getByTestId("user_e2e_owner").click();
    await expect(page).toHaveURL(/\/en\/app(?:\?|$)/u);
    await page.goto("/en/app/onboarding");
    await page.getByLabel("Organization name").fill("Service Request Web Operations");
    await page.getByLabel("Default time zone").fill("America/Lima");
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page).toHaveURL(/\/en\/app\?status=created$/u);
    const orgId = await page.getByRole("combobox", { name: "Organization selector" }).inputValue();
    const identity = await fetch("http://127.0.0.1:4010/test/access-token?identity=user_e2e_owner");
    const { access_token: accessToken } = (await identity.json()) as { access_token: string };
    async function api(path: string, body: unknown, method = "POST") {
        const response = await fetch(`http://127.0.0.1:3001/api/v1${path}`, {
            method,
            headers: {
                authorization: `Bearer ${accessToken}`,
                "x-ardenfold-organization-id": orgId,
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        });
        expect(response.ok).toBe(true);
        return (await response.json()) as { id: string };
    }
    const customer = await api("/parties", {
        kind: "organization",
        displayName: "Intake Instruments Ltd",
        roles: ["customer"],
    });
    await api(`/parties/${customer.id}/contacts`, {
        expectedVersion: 1,
        displayName: "Alex Intake",
    });
    await api("/assets", { displayName: "Registered intake pump" });

    await page.getByRole("link", { name: "Service requests", exact: true }).first().click();
    await expect(page.getByText("No service requests have been recorded yet.")).toBeVisible();
    await page.getByRole("link", { name: "New service request" }).click();
    await page.getByLabel("Search customers").fill("Intake Instruments");
    await page.getByLabel("Search customers").press("Enter");
    await page.getByRole("button", { name: "Intake Instruments Ltd" }).click();
    await page.getByLabel("Requester contact").selectOption({ label: "Alex Intake" });
    await page.getByLabel("Short summary").fill("Investigate unknown pump");
    await page.getByLabel("Customer notes and context").fill("Customer reports pressure loss.");
    await page.getByRole("button", { name: "Add scope item" }).click();
    await page.getByLabel("Requested work or need").fill("Inspect pressure loss");
    await page.getByLabel("Unidentified asset details").fill("Serial not yet provided");
    await page.getByRole("button", { name: "Create request", exact: true }).click();
    await expect(page).toHaveURL(/\/service-requests\/[0-9a-f-]+\?notice=success$/u, {
        timeout: 15_000,
    });
    const requestId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(page.getByText("Serial not yet provided", { exact: false })).toBeVisible();
    await expect(page.getByText("Alex Intake", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Edit service request" }).click();
    await page.getByLabel("Search registered assets").fill("Registered intake");
    await page.getByLabel("Search registered assets").press("Enter");
    await page.getByRole("button", { name: "Registered intake pump", exact: true }).click();
    await page.getByLabel("Reason for change").fill("Customer identified equipment");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Known asset: Registered intake pump")).toBeVisible();

    await page.getByRole("link", { name: "Edit service request" }).click();
    await page.getByRole("button", { name: "Remove asset association" }).click();
    await page.getByLabel("Short summary").fill("Revised customer need");
    await page.getByLabel("Reason for change").fill("Scope clarified with customer");
    await api(
        `/service-requests/${requestId}`,
        {
            expectedVersion: 2,
            summary: "Concurrent request clarification",
            reason: "Operations corrected summary",
        },
        "PATCH",
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Concurrent request clarification", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Short summary")).toHaveValue("Revised customer need");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await page.getByRole("button", { name: "I reviewed the changes; keep my draft" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "Revised customer need" })).toBeVisible();
    await expect(page.getByText("Known asset: Registered intake pump")).toHaveCount(0);

    await page.getByLabel("Reason for closing or cancelling").fill("Customer need resolved");
    await page.getByRole("button", { name: "Close request", exact: true }).click();
    await expect(page.getByRole("link", { name: "Edit service request" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
    await expect(page.getByText("Customer need resolved", { exact: true })).toBeVisible();
    await page.goto(`/es/app/service-requests/${requestId}`);
    await expect(page.getByRole("heading", { name: "Detalles de la solicitud" })).toBeVisible();
    await expect(page.getByText(/Cerrada · Versión/u)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
});
