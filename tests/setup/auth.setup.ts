import { type APIRequestContext, test as setup, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { ApiClient, type Reservation } from "../support/api-client";
import { readToken } from "../support/fixtures";
import { ADMIN, ADMIN_STATE, API_URL, AUTH_DIR, MEMBER_STATE, QA_API_USER, QA_UI_USER, UI_URL, UI_USER_STATE } from "../support/env";

// Run in order: wake the API first, then log in, then register (which may fall back to the member session).
setup.describe.configure({ mode: "serial" });

// The free-tier API sleeps when idle; wake it before the suite starts so the
// first real test isn't charged a ~60 second cold start.
setup("wake the API", async ({ request }) => {
  setup.setTimeout(180_000);
  await expect
    .poll(
      async () => {
        const response = await request.get(`${API_URL}/api/v1/health`, { timeout: 30_000 }).catch(() => null);
        return response?.status() ?? 0;
      },
      { timeout: 170_000, intervals: [2_000, 5_000, 10_000] },
    )
    .toBe(200);
});

// Log in once per run and save each session in Playwright's storage-state format.
// UI tests start already logged in (the app keeps its token in localStorage), and
// API tests reuse the same token. This keeps the suite well under the API's
// login rate limit of 10 attempts per minute.
function writeState(path: string, token: string, user: unknown): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: UI_URL,
          localStorage: [
            { name: "token", value: token },
            { name: "user", value: JSON.stringify(user) },
          ],
        },
      ],
    }),
  );
}

async function saveSession(api: ApiClient, email: string, password: string, path: string): Promise<void> {
  const { token, user } = await api.login(email, password);
  writeState(path, token, user);
}

/** Logs in as a QA account, registering it the first time the suite runs against an environment. */
async function ensureQaAccount(request: APIRequestContext, account: { name: string; email: string; password: string }, path: string) {
  const login = await request.post(`${API_URL}/api/v1/auth/login`, { data: { email: account.email, password: account.password } });
  if (login.status() === 200) {
    const { token, user } = await login.json();
    return writeState(path, token, user);
  }
  expect(login.status(), await login.text()).toBe(401);

  const register = await request.post(`${API_URL}/api/v1/auth/register`, { data: account });
  expect(register.status(), `could not register ${account.email}: ${await register.text()}`).toBe(201);
  const { token, user } = await register.json();
  writeState(path, token, user);
}

setup("log in as the QA API account", async ({ request }) => {
  await ensureQaAccount(request, QA_API_USER, MEMBER_STATE);
});

setup("log in as the QA browser account", async ({ request }) => {
  await ensureQaAccount(request, QA_UI_USER, UI_USER_STATE);
});

setup("log in as admin (when ADMIN_PASSWORD is set)", async ({ request }) => {
  setup.skip(!ADMIN.password, "ADMIN_PASSWORD not provided");
  await saveSession(new ApiClient(request), ADMIN.email, ADMIN.password, ADMIN_STATE);
});

// Hygiene: cancel confirmed bookings left behind by an earlier run that crashed
// before its cleanup ran, so every run starts from a known state.
setup("cancel leftover QA bookings", async ({ request }) => {
  for (const path of [MEMBER_STATE, UI_USER_STATE]) {
    const client = new ApiClient(request, readToken(path));
    for (;;) {
      const response = await client.get("/api/v1/reservations", { status: "confirmed", per_page: 100 });
      expect(response.status()).toBe(200);
      const { data } = (await response.json()) as { data: Reservation[] };
      const live = data.filter((r) => new Date(r.ends_at).getTime() > Date.now());
      if (live.length === 0) break;
      for (const reservation of live) {
        expect([200, 422]).toContain((await client.cancelReservation(reservation.id)).status());
      }
    }
  }
});
