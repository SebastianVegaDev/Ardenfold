import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test("quotation UI preserves revisions and records acceptance of the agreed revision", async ({
    page,
}) => {
    test.setTimeout(120_000);
    await page.goto("/en/sign-in");
    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await page.getByTestId("user_e2e_owner").click();
    await expect(page).toHaveURL(/\/en\/app(?:\?|$)/u);
    await page.goto("/en/app/onboarding");
    await page.getByLabel("Organization name").fill("Quotation Web Operations");
    await page.getByLabel("Default time zone").fill("America/Lima");
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page).toHaveURL(/\/en\/app\?status=created$/u);
    const organizationId = await page
        .getByRole("combobox", { name: "Organization selector" })
        .inputValue();
    const tokenResponse = await fetch(
        "http://127.0.0.1:4010/test/access-token?identity=user_e2e_owner",
    );
    const { access_token: token } = (await tokenResponse.json()) as { access_token: string };
    async function create(path: string, body: unknown): Promise<{ id: string }> {
        const response = await fetch(`http://127.0.0.1:3001/api/v1${path}`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${token}`,
                "x-ardenfold-organization-id": organizationId,
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        });
        const value: unknown = await response.json();
        expect(response.ok, JSON.stringify(value)).toBe(true);
        return value as { id: string };
    }
    const customer = await create("/parties", {
        kind: "organization",
        displayName: "Quotation Web Customer",
        roles: ["customer"],
    });
    const request = await create("/service-requests", {
        customerPartyId: customer.id,
        summary: "Inspect compressor",
        scopeItems: [{ description: "Inspect compressor bearings" }],
    });

    await page.goto(`/en/app/service-requests/${request.id}`);
    await page.getByRole("link", { name: "Create quotation" }).click();
    await expect(page.getByRole("heading", { name: "New quotation" })).toBeVisible();
    await expect(page.getByLabel("Description")).toHaveValue("Inspect compressor bearings");
    await page.getByLabel("Quotation reference").fill(`Q-WEB-${randomUUID()}`);
    await page.getByLabel("Unit price").fill("125.25");
    await page.getByLabel("Payment terms").fill("Due on completion");
    const creationResponse = page.waitForResponse(
        (response) =>
            response.url().endsWith("/auth/quotations") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create quotation" }).click();
    const created = await creationResponse;
    expect(created.ok(), await created.text()).toBe(true);
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]+\?notice=success$/u);
    const quoteUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("listitem", { name: "Revision 1" })).toContainText("Draft");

    await page.getByLabel("Communication channel").fill("email");
    await page.getByRole("button", { name: "Issue revision" }).click();
    await expect(page.getByRole("listitem", { name: "Revision 1" })).toContainText("Offered");
    await expect(page.getByRole("listitem", { name: "Revision 1" })).toContainText("125.25");
    await page.getByRole("button", { name: "Create new revision from this one" }).click();
    await expect(page.getByRole("listitem", { name: "Revision 2" })).toContainText("Draft");
    await expect(page.getByRole("listitem", { name: "Revision 1" })).toContainText("125.25");
    await page.getByRole("link", { name: "Edit draft" }).click();
    await page.getByLabel("Unit price").fill("150.00");
    await page.getByLabel("Reason for draft change").fill("Updated commercial scope");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]+\?notice=success$/u);
    await page.getByLabel("Communication channel").fill("email");
    await page.getByRole("button", { name: "Issue revision" }).click();
    await expect(page.getByRole("listitem", { name: "Revision 1" })).toContainText("Superseded");
    await expect(page.getByRole("listitem", { name: "Revision 2" })).toContainText("150.00");
    await page.getByLabel("Communication channel").fill("email");
    await page.getByRole("button", { name: "Record acceptance of revision 2" }).click();
    await expect(page.getByText("Active agreement: revision 2")).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Revision 2" })).toContainText("Accepted");
    await expect(page.getByRole("listitem", { name: "Revision 1" })).toContainText("125.25");
    await expect(page.getByRole("link", { name: "Edit draft" })).toHaveCount(0);
    await page.goto(`/es${quoteUrl.slice(3)}`);
    await expect(page.getByText("Acuerdo vigente: revisión 2")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
});
