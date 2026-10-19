import { test, expect } from "@playwright/test";
import { AppPage } from "../pages/app.page";

test.describe("Browsing as a visitor", () => {
  test("TC-UI-001 home page loads, API is online, and resources are listed @smoke", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();

    await expect(page).toHaveTitle(/Community Resource Reservations/);
    await expect(app.loginHeading).toBeVisible();
    expect(await app.resourceCards().count()).toBeGreaterThan(0);
  });

  test("TC-UI-002 search narrows the list as you type", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();
    const total = await app.resourceCards().count();

    await app.search.fill("study");

    await expect(app.resourceCards()).not.toHaveCount(total);
    for (const card of await app.resourceCards().all()) {
      await expect(card).toContainText(/study/i);
    }
  });

  test("TC-UI-003 category filter shows only that category", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();

    await app.category.selectOption("equipment");

    await expect(app.resourceCards().first()).toContainText(/equipment/i);
    for (const card of await app.resourceCards().all()) {
      await expect(card).toContainText(/equipment/i);
    }
  });

  test("TC-UI-004 a search with no matches shows an empty state", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();

    await app.search.fill("zzz-no-such-resource");

    await expect(app.resourceList).toContainText("No resources match these filters.");
  });

  test("TC-UI-005 selecting a resource shows details and availability; booking requires login", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();

    await app.selectResource(/Study Room/);

    await expect(app.bookingCard.getByRole("heading", { level: 2 })).toHaveText(/Study Room/);
    await expect(app.availability.locator("li").first()).toBeVisible();
    await expect(app.bookingLoginHint).toBeVisible();
  });

  test("TC-UI-006 visitors who try to book are told to log in", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();
    await app.selectResource(/Study Room/);

    await app.reserveButton.click();

    await expect(app.bookingError).toHaveText("Log in to make a reservation.");
  });
});
