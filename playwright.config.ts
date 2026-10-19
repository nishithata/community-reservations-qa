import { defineConfig, devices } from "@playwright/test";
import { API_URL, UI_URL } from "./tests/support/env";

/**
 * Test projects:
 *   setup       wakes the API and logs in once (avoids the login rate limit)
 *   api         HTTP-level tests, no browser
 *   ui-*        end-to-end browser tests (full suite on Chromium, @smoke on Firefox/WebKit/mobile)
 *   a11y        automated accessibility audits with axe-core
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],
  use: {
    baseURL: UI_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /setup\/.*\.setup\.ts/ },
    {
      name: "api",
      testMatch: /api\/.*\.spec\.ts/,
      dependencies: ["setup"],
      timeout: 180_000, // allows for waiting out a rate-limit window
      use: { baseURL: API_URL },
    },
    {
      name: "ui-chromium",
      testMatch: /ui\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "ui-firefox",
      testMatch: /ui\/.*\.spec\.ts/,
      grep: /@smoke/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "ui-webkit",
      testMatch: /ui\/.*\.spec\.ts/,
      grep: /@smoke/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "ui-mobile",
      testMatch: /ui\/.*\.spec\.ts/,
      grep: /@smoke/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "a11y",
      testMatch: /a11y\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
