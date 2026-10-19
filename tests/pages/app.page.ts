import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Page object for the single-page demo client. Selectors prefer accessible
 * roles and labels (what users and screen readers see) over CSS ids.
 */
export class AppPage {
  readonly apiStatus: Locator;
  readonly loginHeading: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;
  readonly demoButton: Locator;
  readonly logoutButton: Locator;
  readonly sessionName: Locator;
  readonly authError: Locator;

  readonly search: Locator;
  readonly category: Locator;
  readonly resourceList: Locator;

  readonly bookingCard: Locator;
  readonly date: Locator;
  readonly startTime: Locator;
  readonly duration: Locator;
  readonly notes: Locator;
  readonly reserveButton: Locator;
  readonly bookingError: Locator;
  readonly bookingLoginHint: Locator;
  readonly availability: Locator;

  readonly reservationRows: Locator;
  readonly reservationStatus: Locator;
  readonly toast: Locator;

  constructor(readonly page: Page) {
    this.apiStatus = page.getByTitle("API health");
    this.loginHeading = page.getByRole("heading", { name: "Log in" });
    this.email = page.getByLabel("Email");
    this.password = page.getByLabel("Password");
    this.loginButton = page.getByRole("button", { name: "Log in", exact: true });
    this.demoButton = page.getByRole("button", { name: "Use demo account" });
    this.logoutButton = page.getByRole("button", { name: "Log out" });
    this.sessionName = page.locator("#session-name");
    this.authError = page.locator("#auth-error");

    this.search = page.getByRole("searchbox", { name: "Search resources" });
    this.category = page.locator("#resource-filters").getByRole("combobox", { name: "Category" });
    this.resourceList = page.locator("#resource-list");

    this.bookingCard = page.locator("#booking-card");
    this.date = page.getByLabel("Date (UTC)");
    this.startTime = page.getByLabel("Start time (UTC)");
    this.duration = page.getByLabel("Duration");
    this.notes = page.getByLabel("Notes (optional)");
    this.reserveButton = page.getByRole("button", { name: "Reserve" });
    this.bookingError = page.locator("#booking-error");
    this.bookingLoginHint = page.getByText("Log in to make a reservation.");
    this.availability = page.locator("#availability-list");

    this.reservationRows = page.locator("#reservation-rows tr");
    this.reservationStatus = page.getByRole("combobox", { name: "Filter by status" });
    this.toast = page.getByRole("status").filter({ hasText: /./ });
  }

  async open(): Promise<void> {
    await this.page.goto("/");
    // The free API can take up to a minute to wake; the page polls until it's online.
    await expect(this.apiStatus).toHaveText("API online", { timeout: 90_000 });
    await expect(this.resourceCards().first()).toBeVisible();
  }

  resourceCards(): Locator {
    return this.resourceList.getByRole("button");
  }

  async selectResource(name: string | RegExp): Promise<void> {
    await this.resourceCards().filter({ hasText: name }).first().click();
    await expect(this.bookingCard).toBeVisible();
  }

  async book(options: { date: string; startTime: string; durationMinutes?: 30 | 60 | 120 | 240; notes?: string }): Promise<void> {
    await this.date.fill(options.date);
    await this.startTime.fill(options.startTime);
    await this.duration.selectOption(String(options.durationMinutes ?? 60));
    if (options.notes !== undefined) await this.notes.fill(options.notes);
    await this.reserveButton.click();
  }

  /** QA accounts keep a long history of cancelled bookings; show only live ones. */
  async showConfirmedOnly(): Promise<void> {
    await this.reservationStatus.selectOption("confirmed");
  }

  reservationRow(text: string): Locator {
    return this.reservationRows.filter({ hasText: text });
  }

  async cancelReservation(row: Locator): Promise<void> {
    this.page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Cancel" }).click();
  }
}
