import { test as base, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { ApiClient } from "./api-client";
import { ADMIN_STATE, MEMBER_STATE } from "./env";

export function readToken(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const state = JSON.parse(readFileSync(path, "utf8")) as { origins?: { localStorage: { name: string; value: string }[] }[] };
  return state.origins?.flatMap((o) => o.localStorage).find((item) => item.name === "token")?.value;
}

interface Fixtures {
  api: ApiClient;
  memberApi: ApiClient;
  adminApi: ApiClient;
  /** Reservation IDs registered here are cancelled after the test, even if it fails. */
  cleanup: { reservation: (id: number) => void };
}

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new ApiClient(request));
  },

  memberApi: async ({ request }, use) => {
    const token = readToken(MEMBER_STATE);
    if (!token) throw new Error(`No member session at ${MEMBER_STATE}; did the setup project run?`);
    await use(new ApiClient(request, token));
  },

  adminApi: async ({ request }, use) => {
    const token = readToken(ADMIN_STATE);
    test.skip(!token, "ADMIN_PASSWORD not provided; skipping admin-only checks");
    await use(new ApiClient(request, token));
  },

  cleanup: async ({ request }, use) => {
    const reservationIds: number[] = [];
    await use({ reservation: (id) => reservationIds.push(id) });

    const token = readToken(MEMBER_STATE);
    const adminToken = readToken(ADMIN_STATE);
    const client = new ApiClient(request, adminToken ?? token);
    for (const id of reservationIds) {
      // 200 = cancelled now, 422 = already cancelled by the test itself; both are fine.
      const response = await client.cancelReservation(id);
      expect([200, 422, 404]).toContain(response.status());
    }
  },
});

export { expect };
