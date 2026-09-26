import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test("work order and receipt UI keeps commercial basis and Registry custody authoritative", async ({
    page,
}) => {
    test.setTimeout(120_000);
    await page.goto("/en/sign-in");
    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await page.getByTestId("user_e2e_owner").click();
    await expect(page).toHaveURL(/\/en\/app(?:\?|$)/u);
    await page.goto("/en/app/onboarding");
    await page.getByLabel("Organization name").fill("Work UI Operations");
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
    async function call(path: string, method: string, body: unknown) {
        const response = await fetch(`http://127.0.0.1:3001/api/v1${path}`, {
            method,
            headers: {
                authorization: `Bearer ${token}`,
                "x-ardenfold-organization-id": organizationId,
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        });
        const value = (await response.json()) as Record<string, unknown>;
        expect(response.ok, JSON.stringify(value)).toBe(true);
        return value;
    }
    const site = await call("/organizations/current/sites", "POST", { name: "Main shop" });
    const customer = await call("/parties", "POST", {
        kind: "organization",
        displayName: "Industrial customer",
        roles: ["customer"],
    });
    const asset = await call("/assets", "POST", { displayName: "Pump A" });
    const request = await call("/service-requests", "POST", {
        customerPartyId: customer.id,
        summary: "Inspect pump",
        scopeItems: [{ description: "Inspect pump bearings", assetId: asset.id }],
    });
    const quote = await call("/quotations", "POST", {
        requestId: request.id,
        reference: `Q-${randomUUID()}`,
        draft: {
            currencyCode: "PEN",
            paymentTerms: null,
            deliveryTerms: null,
            serviceLocation: null,
            intakeExpectations: null,
            exclusions: null,
            validUntil: null,
            adjustments: [],
            lines: [
                {
                    description: "Inspect pump bearings",
                    quantity: "1",
                    unit: "unit",
                    unitPrice: "100",
                    partyId: null,
                    assetId: asset.id,
                    adjustments: [],
                },
            ],
        },
    });
    const revision = (quote.revisions as Array<{ id: string }>)[0]!;
    const offered = await call(
        `/quotations/${quote.id as string}/revisions/${revision.id}/issue`,
        "POST",
        {
            expectedVersion: quote.version,
            channel: "email",
        },
    );
    await call(`/quotations/${quote.id as string}/acceptances`, "POST", {
        expectedVersion: offered.version,
        idempotencyKey: randomUUID(),
        revisionId: revision.id,
        agreementAt: null,
        suppliedByName: "Customer",
        suppliedByContactId: null,
        channel: "email",
        externalReference: null,
    });

    await page.goto(`/en/app/quotations/${quote.id as string}`);
    await page.getByRole("link", { name: "Create work order from this acceptance" }).click();
    await expect(page.getByRole("heading", { name: "Accepted commercial basis" })).toBeVisible();
    await page.getByLabel("Work order reference").fill(`WO-${randomUUID()}`);
    await page.getByLabel("Work site").selectOption(site.id as string);
    const creation = page.waitForResponse(
        (response) =>
            response.url().endsWith("/auth/work-orders") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create work order" }).click();
    expect((await creation).ok()).toBe(true);
    await expect(page).toHaveURL(/\/en\/app\/work-orders\/[0-9a-f-]+$/u);
    await expect(page.getByRole("heading", { name: "Accepted commercial basis" })).toBeVisible();
    await expect(page.getByText("A physical receipt is required.")).toBeVisible();
    await page.getByRole("checkbox", { name: /Item 1/ }).check();
    await page.getByLabel("Intake context").fill("Received at desk");
    await page.getByLabel("Observed condition").fill("Case scratched");
    await page.getByLabel("Person receiving the item").fill("Technician");
    const localTime = await page.evaluate(() => {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 16);
    });
    await page.getByLabel("Received at").fill(localTime);
    await page.getByLabel("Accessories and components").fill("Cable\nCase");
    const intake = page.waitForResponse(
        (response) =>
            response.url().endsWith("/auth/receipts") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Record physical intake" }).click();
    const intakeResponse = await intake;
    expect(intakeResponse.ok(), await intakeResponse.text()).toBe(true);
    await expect(page.getByRole("link", { name: "View receipt" })).toBeVisible();
    await expect(page.getByText("Current Asset Registry relationships").first()).toBeVisible();
    await page.getByRole("link", { name: "View receipt" }).click();
    await expect(page.getByRole("heading", { name: "Recorded intake facts" })).toBeVisible();
    await expect(page.getByText("Cable", { exact: true })).toBeVisible();
    await page.getByLabel("Reason for correction").fill("Rechecked condition");
    await page.getByLabel("Observed condition").fill("Case clean");
    const correction = page.waitForResponse(
        (response) =>
            response.url().endsWith("/auth/receipts") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save correction" }).click();
    expect((await correction).ok()).toBe(true);
    await expect(page.getByText("The correction was recorded.")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
});
