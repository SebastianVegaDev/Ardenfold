import { defineConfig, devices } from "@playwright/test";

const webOrigin = "http://localhost:3000";

export default defineConfig({
    testDir: "./tests",
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
    outputDir: "test-results",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: webOrigin,
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
        video: "off",
    },
    webServer: {
        command: "tsx scripts/start-platform.ts",
        cwd: __dirname,
        url: `${webOrigin}/en`,
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
