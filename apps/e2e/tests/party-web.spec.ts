import { expect, test } from "@playwright/test";

test("party registry supports creation, details, lifecycle and both locales", async ({ page }) => {
    await page.goto("/en/sign-in");
    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await page.getByTestId("user_e2e_owner").click();
    await expect(page).toHaveURL(/\/en\/app(?:\?|$)/u);

    await page.goto("/en/app/onboarding");
    await page.getByLabel("Organization name").fill("Party Web Registry");
    await page.getByLabel("Default time zone").fill("America/Lima");
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page).toHaveURL(/\/en\/app\?status=created$/u);

    await page.getByRole("link", { name: "Parties" }).first().click();
    await expect(page.getByRole("heading", { name: "Parties" })).toBeVisible();
    await page.getByText("Add a party", { exact: true }).click();
    await page.getByLabel("Display name").fill("Field Instruments Ltd");
    await page.getByLabel("Legal name (optional)").fill("Field Instruments Limited");
    await page.getByLabel("Provider", { exact: true }).check();
    await page.getByRole("button", { name: "Create party" }).click();
    await expect(page).toHaveURL(/\/en\/app\/parties\/[0-9a-f-]+\?notice=success$/u);
    await expect(page.getByRole("heading", { name: "Field Instruments Ltd" })).toBeVisible();

    await page.getByLabel("Identifier type").fill("tax_id");
    await page.getByLabel("Identifier value").fill("TAX-123");
    await page.getByRole("button", { name: "Add identifier" }).click();
    await expect(page.getByText("TAX-123")).toBeVisible();

    await page.getByLabel("Contact name").fill("Alex Contact");
    await page.getByLabel("Primary contact").last().check();
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { name: /Alex Contact/u })).toBeVisible();

    await page.getByLabel("Contact detail").fill("alex@example.test");
    await page.getByRole("button", { name: "Add channel" }).click();
    await expect(page.locator('input[name="value"]').first()).toHaveValue("alex@example.test");

    await page.getByLabel("Address label").fill("Main office");
    await page.getByLabel("Address line 1").fill("Main Street 1");
    await page.getByLabel("City or locality").fill("Lima");
    await page.getByLabel("Two-letter country code").fill("pe");
    await page.getByRole("button", { name: "Add address" }).click();
    await expect(page.getByRole("heading", { name: "Main office" })).toBeVisible();

    await page.getByText("Confirm archival").click();
    await page.getByRole("button", { name: "Archive party" }).click();
    await expect(page.getByText("Confirm restoration")).toBeVisible();
    await page.getByText("Confirm restoration").click();
    await page.getByRole("button", { name: "Restore party" }).click();
    await expect(page.getByText("Confirm archival")).toBeVisible();

    await page.goto("/es/app/parties");
    await expect(page.getByRole("heading", { name: "Contrapartes" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    await expect(page.getByRole("link", { name: "Contrapartes" }).last()).toBeVisible();
});
