import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { AppPage } from "../pages/app.page";
import { ApiClient } from "../support/api-client";
import { ADMIN_STATE } from "../support/env";
import { readToken } from "../support/fixtures";

test.skip(!existsSync(ADMIN_STATE), "ADMIN_PASSWORD not provided; skipping admin UI checks");
test.use({ storageState: existsSync(ADMIN_STATE) ? ADMIN_STATE : undefined });

test("TC-UI-030 admins can add a resource from the UI", async ({ page, request, browserName }) => {
  test.skip(browserName !== "chromium", "admin flow runs on Chromium only");
  const app = new AppPage(page);
  await app.open();
  const name = `QA Folding Tables ${Date.now()}`;
  const form = page.locator("#admin-card");

  await expect(page.getByRole("heading", { name: /Add a resource/ })).toBeVisible();
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Category").selectOption("equipment");
  await form.getByLabel("Capacity").fill("12");
  await form.getByRole("button", { name: "Create resource" }).click();

  await expect(app.toast).toHaveText(`Created "${name}".`);

  // Clean up through the API.
  const admin = new ApiClient(request, readToken(ADMIN_STATE));
  const { data } = await (await admin.get("/api/v1/resources", { q: name })).json();
  expect(data).toHaveLength(1);
  expect((await admin.delete(`/api/v1/resources/${data[0].id}`)).status()).toBe(204);
});
