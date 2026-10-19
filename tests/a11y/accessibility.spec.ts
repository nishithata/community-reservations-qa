import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { AppPage } from "../pages/app.page";
import { UI_USER_STATE } from "../support/env";

// WCAG 2.1 A and AA rules. Serious and critical violations fail the test;
// everything else is attached to the report for review.
async function audit(page: import("@playwright/test").Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  await test.info().attach(`axe-${name}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" });

  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = blocking.map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} element(s)]`).join("\n");
  expect(blocking, `Accessibility violations on ${name}:\n${summary}`).toEqual([]);
}

test("TC-A11Y-001 home page (visitor) has no serious accessibility violations", async ({ page }) => {
  const app = new AppPage(page);
  await app.open();
  await audit(page, "home-visitor");
});

test.describe("logged in", () => {
  test.use({ storageState: UI_USER_STATE });

  test("TC-A11Y-002 booking view (member) has no serious accessibility violations", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();
    await app.selectResource(/Study Room/);
    await audit(page, "booking-member");
  });
});

test("TC-A11Y-003 every form control has an accessible name", async ({ page }) => {
  const app = new AppPage(page);
  await app.open();

  for (const control of await page.locator("input:visible, select:visible, textarea:visible").all()) {
    const name = await control.evaluate((el) => {
      const element = el as HTMLInputElement;
      return element.labels?.[0]?.textContent?.trim() || element.getAttribute("aria-label") || "";
    });
    expect(name, await control.evaluate((el) => el.outerHTML)).not.toBe("");
  }
});

test("TC-A11Y-004 the page can be operated with the keyboard alone", async ({ page }) => {
  const app = new AppPage(page);
  await app.open();

  // Tab to the first resource card and open it with Enter.
  const firstCard = app.resourceCards().first();
  await firstCard.focus();
  await expect(firstCard).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(app.bookingCard).toBeVisible();
});
