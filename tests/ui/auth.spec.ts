import { test, expect } from "@playwright/test";
import { AppPage } from "../pages/app.page";
import { MEMBER } from "../support/env";

// Real logins through the UI are limited to Chromium to stay under the API's
// login rate limit; other browsers start from the saved session instead.
test.describe("Logging in and out", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "login flows run on Chromium only");

  test("TC-UI-010 the demo account button logs in and shows the session", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();

    await app.demoButton.click();

    await expect(app.sessionName).toHaveText("Demo Member");
    await expect(page.getByRole("heading", { name: "My reservations" })).toBeVisible();
    await expect(app.loginHeading).toBeHidden();
  });

  test("TC-UI-011 a wrong password shows an error and stays logged out", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();

    await app.email.fill(MEMBER.email);
    await app.password.fill("definitely-wrong");
    await app.loginButton.click();

    await expect(app.authError).toHaveText("Invalid email or password");
    await expect(app.logoutButton).toBeHidden();
  });

  test("TC-UI-012 the sign-up form adds a name field and validates on the server", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();

    await page.getByRole("button", { name: "New here? Create an account" }).click();
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();

    await page.getByRole("button", { name: "Already have an account? Log in" }).click();
    await expect(app.loginHeading).toBeVisible();
  });
});
