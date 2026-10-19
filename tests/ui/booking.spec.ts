import { test, expect } from "@playwright/test";
import { AppPage } from "../pages/app.page";
import { UI_USER_STATE } from "../support/env";
import { uniqueSlot } from "../support/test-data";

// Start already logged in as this run's dedicated browser-test member.
test.use({ storageState: UI_USER_STATE });

const plusOneHour = (time: string) => `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}${time.slice(2)}`;

test.describe("Booking as a logged-in member", () => {
  test("TC-UI-020 book a slot, see it everywhere, then cancel it @smoke", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();
    const slot = uniqueSlot();
    const note = `QA-UI ${Date.now()}`;

    await app.selectResource(/Study Room/);
    await app.book({ date: slot.date, startTime: slot.startTime, notes: note });

    await expect(app.toast).toHaveText("Reservation confirmed.");
    await expect(app.availability).toContainText(`${slot.startTime} to ${plusOneHour(slot.startTime)}`);
    await app.showConfirmedOnly();
    const row = app.reservationRow(note);
    await expect(row).toContainText("Study Room");
    await expect(row).toContainText("confirmed");

    await app.cancelReservation(row);

    await expect(app.toast).toHaveText("Reservation cancelled.");
    await expect(row, "cancelled bookings leave the Confirmed view").toHaveCount(0);
    await expect(app.availability).not.toContainText(`${slot.startTime} to`);
  });

  test("TC-UI-021 booking a taken slot shows a clear conflict message", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();
    const slot = uniqueSlot();
    const note = `QA-UI conflict ${Date.now()}`;

    await app.selectResource(/Projector/);
    await app.book({ date: slot.date, startTime: slot.startTime, notes: note });
    await expect(app.toast).toHaveText("Reservation confirmed.");

    await app.book({ date: slot.date, startTime: slot.startTime });

    await expect(app.bookingError).toContainText("That slot is taken.");
    await expect(app.bookingError).toContainText("overlaps an existing reservation");

    await app.showConfirmedOnly();
    await app.cancelReservation(app.reservationRow(note)); // clean up
    await expect(app.toast).toHaveText("Reservation cancelled.");
  });

  test("TC-UI-022 user-supplied notes are rendered as text, never as HTML", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();
    const slot = uniqueSlot();
    const payload = `<img src=x onerror="window.__xss=1">QA-XSS-${Date.now()}`;

    await app.selectResource(/Study Room/);
    await app.book({ date: slot.date, startTime: slot.startTime, notes: payload });
    await expect(app.toast).toHaveText("Reservation confirmed.");

    await app.showConfirmedOnly();
    const row = app.reservationRow(payload);
    await expect(row).toContainText(payload); // shown literally
    await expect(row.locator("img")).toHaveCount(0); // no element injected
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

    await app.cancelReservation(row);
    await expect(app.toast).toHaveText("Reservation cancelled.");
  });

  test("TC-UI-023 logging out returns to the login form and hides private data", async ({ page }) => {
    const app = new AppPage(page);
    await app.open();
    await expect(app.logoutButton).toBeVisible();

    await app.logoutButton.click();

    await expect(app.loginHeading).toBeVisible();
    await expect(page.locator("#reservations-card")).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  });
});
