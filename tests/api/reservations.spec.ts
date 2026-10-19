import { test, expect, readToken } from "../support/fixtures";
import { ApiClient, expectApiError, type Reservation } from "../support/api-client";
import { API_URL, MEMBER_STATE } from "../support/env";
import { addMinutes, uniqueEmail, uniqueSlot } from "../support/test-data";

test.describe("Reservations: create", () => {
  test("TC-RSV-001 a member books a free slot @smoke", async ({ memberApi, cleanup }) => {
    const resource = await memberApi.firstActiveResource();
    const slot = uniqueSlot();

    const response = await memberApi.createReservation({ resource_id: resource.id, ...slot, notes: "QA automation" });

    expect(response.status(), await response.text()).toBe(201);
    const { data } = (await response.json()) as { data: Reservation };
    cleanup.reservation(data.id);
    expect(data).toMatchObject({
      status: "confirmed",
      starts_at: slot.starts_at.replace(".000Z", "Z"),
      ends_at: slot.ends_at.replace(".000Z", "Z"),
      notes: "QA automation",
      cancelled_at: null,
      resource: { id: resource.id },
    });
    expect(response.headers()["location"]).toContain(`/api/v1/reservations/${data.id}`);
  });

  test("TC-RSV-002 the server assigns the owner; a user_id in the body is ignored", async ({ memberApi, cleanup }) => {
    const me = (await (await memberApi.get("/api/v1/me")).json()).data;
    const resource = await memberApi.firstActiveResource();

    const response = await memberApi.createReservation({ resource_id: resource.id, ...uniqueSlot(), user_id: 1, status: "cancelled" });

    expect(response.status()).toBe(201);
    const { data } = await response.json();
    cleanup.reservation(data.id);
    expect(data.user.id).toBe(me.id);
    expect(data.status).toBe("confirmed");
  });

  // Boundary value analysis on duration: valid range is 15 minutes to 8 hours inclusive.
  const durationCases: [string, number, number][] = [
    ["14 minutes (just below minimum)", 14, 422],
    ["15 minutes (minimum)", 15, 201],
    ["8 hours (maximum)", 480, 201],
    ["8 hours 1 minute (just above maximum)", 481, 422],
  ];
  for (const [label, minutes, status] of durationCases) {
    test(`TC-RSV-003 duration ${label} → ${status}`, async ({ memberApi, cleanup }) => {
      const resource = await memberApi.firstActiveResource();
      const { starts_at } = uniqueSlot();

      const response = await memberApi.createReservation({ resource_id: resource.id, starts_at, ends_at: addMinutes(starts_at, minutes) });

      if (status === 201) {
        expect(response.status(), await response.text()).toBe(201);
        cleanup.reservation((await response.json()).data.id);
      } else {
        await expectApiError(response, 422, "validation_failed");
      }
    });
  }

  test("TC-RSV-004 end time before start time is rejected with a field error", async ({ memberApi }) => {
    const resource = await memberApi.firstActiveResource();
    const slot = uniqueSlot();

    const response = await memberApi.createReservation({ resource_id: resource.id, starts_at: slot.ends_at, ends_at: slot.starts_at });

    const body = await expectApiError(response, 422, "validation_failed");
    expect(body.error.details?.ends_at).toContain("Ends at must be after starts_at");
  });

  test("TC-RSV-005 a start time in the past is rejected", async ({ memberApi }) => {
    const resource = await memberApi.firstActiveResource();
    const starts_at = new Date(Date.now() - 60 * 60_000).toISOString();

    const response = await memberApi.createReservation({ resource_id: resource.id, starts_at, ends_at: addMinutes(starts_at, 120) });

    const body = await expectApiError(response, 422, "validation_failed");
    expect(body.error.details?.starts_at).toContain("Starts at must be in the future");
  });

  const invalidPayloads: [string, Record<string, unknown>][] = [
    ["missing times", {}],
    ["non-date strings", { starts_at: "tomorrow morning", ends_at: "later" }],
  ];
  for (const [label, extra] of invalidPayloads) {
    test(`TC-RSV-006 ${label} → 422 with field errors`, async ({ memberApi }) => {
      const resource = await memberApi.firstActiveResource();
      const response = await memberApi.createReservation({ resource_id: resource.id, ...extra });

      const body = await expectApiError(response, 422, "validation_failed");
      expect(body.error.details).toHaveProperty("starts_at");
      expect(body.error.details).toHaveProperty("ends_at");
    });
  }

  test("TC-RSV-007 an unknown resource is a validation error, not a crash", async ({ memberApi }) => {
    const response = await memberApi.createReservation({ resource_id: 999_999_999, ...uniqueSlot() });

    const body = await expectApiError(response, 422, "validation_failed");
    expect(body.error.details).toHaveProperty("resource");
  });

  test("TC-RSV-008 a missing payload returns 400; malformed JSON returns 400", async ({ memberApi }) => {
    await expectApiError(await memberApi.post("/api/v1/reservations", {}), 400, "bad_request");
    await expectApiError(await memberApi.postRaw("/api/v1/reservations", "{not json"), 400, "invalid_json");
  });

  test("TC-RSV-009 anonymous users cannot book", async ({ api }) => {
    const resource = await api.firstActiveResource();
    await expectApiError(await api.createReservation({ resource_id: resource.id, ...uniqueSlot() }), 401, "unauthorized");
  });
});

// Decision table for overlap detection against one existing 2-hour booking.
// Half-open intervals [start, end): touching endpoints do not overlap.
test.describe("Reservations: double-booking prevention", () => {
  let base: { starts_at: string; ends_at: string };
  let resourceId: number;
  let baseId: number;
  let owner: ApiClient;

  test.beforeAll(async ({ playwright }) => {
    const context = await playwright.request.newContext();
    owner = new ApiClient(context, readToken(MEMBER_STATE));
    resourceId = (await owner.firstActiveResource()).id;
    base = uniqueSlotOutsideTest();
    const response = await owner.createReservation({ resource_id: resourceId, ...base });
    expect(response.status(), await response.text()).toBe(201);
    baseId = (await response.json()).data.id;
  });

  test.afterAll(async () => {
    await owner.cancelReservation(baseId);
  });

  const scenarios: [string, number, number, number][] = [
    // label, start offset (min), end offset (min), expected status
    ["identical slot", 0, 120, 409],
    ["overlaps the start", -30, 30, 409],
    ["overlaps the end", 90, 150, 409],
    ["fully inside", 30, 90, 409],
    ["fully surrounds", -30, 150, 409],
    ["ends exactly when it starts (adjacent before)", -60, 0, 201],
    ["starts exactly when it ends (adjacent after)", 120, 180, 201],
  ];

  for (const [label, startOffset, endOffset, expected] of scenarios) {
    test(`TC-RSV-010 ${label} → ${expected}`, async ({ memberApi, cleanup }) => {
      const attempt = await memberApi.createReservation({
        resource_id: resourceId,
        starts_at: addMinutes(base.starts_at, startOffset),
        ends_at: addMinutes(base.starts_at, endOffset),
      });

      if (expected === 201) {
        expect(attempt.status(), await attempt.text()).toBe(201);
        cleanup.reservation((await attempt.json()).data.id);
      } else {
        const body = await expectApiError(attempt, 409, "reservation_conflict");
        expect(body.error.message).toContain("overlaps");
      }
    });
  }

  test("TC-RSV-011 the same slot on a different resource is allowed", async ({ memberApi, cleanup }) => {
    const first = await memberApi.firstActiveResource("equipment");
    const second = await memberApi.firstActiveResource("room");
    const slot = uniqueSlot();

    for (const resource of [first, second]) {
      const response = await memberApi.createReservation({ resource_id: resource.id, ...slot });
      expect(response.status()).toBe(201);
      cleanup.reservation((await response.json()).data.id);
    }
  });

  test("TC-RSV-012 concurrent requests for one slot: exactly one succeeds", async ({ memberApi, cleanup }) => {
    const resource = await memberApi.firstActiveResource();
    const slot = uniqueSlot();

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => memberApi.createReservation({ resource_id: resource.id, ...slot })),
    );
    const statuses = responses.map((r) => r.status());
    for (const response of responses.filter((r) => r.status() === 201)) {
      cleanup.reservation((await response.json()).data.id);
    }

    expect(statuses.filter((s) => s === 201), `statuses: ${statuses}`).toHaveLength(1);
    expect(statuses.every((s) => s === 201 || s === 409 || s === 429), `statuses: ${statuses}`).toBe(true);
  });
});

// State transition: confirmed --cancel--> cancelled; cancelled and past reservations are final.
test.describe("Reservations: lifecycle and visibility", () => {
  test("TC-RSV-020 cancel frees the slot and cannot be repeated", async ({ memberApi, cleanup }) => {
    const resource = await memberApi.firstActiveResource();
    const slot = uniqueSlot();
    const created = await (await memberApi.createReservation({ resource_id: resource.id, ...slot })).json();
    cleanup.reservation(created.data.id);

    const cancelled = await memberApi.cancelReservation(created.data.id);
    expect(cancelled.status()).toBe(200);
    expect((await cancelled.json()).data).toMatchObject({ status: "cancelled", cancelled_at: expect.any(String) });

    await expectApiError(await memberApi.cancelReservation(created.data.id), 422, "invalid_state");

    const rebooked = await memberApi.createReservation({ resource_id: resource.id, ...slot });
    expect(rebooked.status(), "a cancelled booking must not block its slot").toBe(201);
    cleanup.reservation((await rebooked.json()).data.id);
  });

  test("TC-RSV-021 listing shows only my reservations, ordered and filterable", async ({ memberApi, cleanup }) => {
    const me = (await (await memberApi.get("/api/v1/me")).json()).data;
    const resource = await memberApi.firstActiveResource();
    const created = await (await memberApi.createReservation({ resource_id: resource.id, ...uniqueSlot() })).json();
    cleanup.reservation(created.data.id);

    const { data, meta } = await (await memberApi.get("/api/v1/reservations", { per_page: 100 })).json();
    expect(data.every((r: Reservation) => r.user.id === me.id)).toBe(true);
    const starts = data.map((r: Reservation) => r.starts_at);
    expect(starts).toEqual([...starts].sort());
    expect(meta.total_count).toBeGreaterThanOrEqual(1);

    const confirmed = await (await memberApi.get("/api/v1/reservations", { status: "confirmed", resource_id: resource.id, per_page: 100 })).json();
    expect(confirmed.data.every((r: Reservation) => r.status === "confirmed" && r.resource.id === resource.id)).toBe(true);
    expect(confirmed.data.map((r: Reservation) => r.id)).toContain(created.data.id);
  });

  test("TC-RSV-022 invalid filters are rejected with 400", async ({ memberApi }) => {
    await expectApiError(await memberApi.get("/api/v1/reservations", { status: "maybe" }), 400, "bad_request");
    await expectApiError(await memberApi.get("/api/v1/reservations", { from: "yesterday" }), 400, "bad_request");
  });

  test("TC-RSV-023 another member's reservation is invisible (404, not 403)", async ({ memberApi, request }) => {
    // Create a second member with their own booking. Uses one of the limited sign-ups.
    const register = await request.post(`${API_URL}/api/v1/auth/register`, {
      data: { name: "QA Other Member", email: uniqueEmail("qa-other"), password: "a-long-password" },
    });
    test.skip(register.status() === 429, "sign-up rate limit reached; rerun later");
    expect(register.status()).toBe(201);
    const other = new ApiClient(request, (await register.json()).token);

    const resource = await other.firstActiveResource();
    const theirs = await (await other.createReservation({ resource_id: resource.id, ...uniqueSlot() })).json();

    try {
      await expectApiError(await memberApi.get(`/api/v1/reservations/${theirs.data.id}`), 404, "not_found");
      await expectApiError(await memberApi.cancelReservation(theirs.data.id), 404, "not_found");
      const mine = await (await memberApi.get("/api/v1/reservations", { per_page: 100 })).json();
      expect(mine.data.map((r: Reservation) => r.id)).not.toContain(theirs.data.id);
    } finally {
      expect((await other.cancelReservation(theirs.data.id)).status()).toBe(200);
    }
  });

  test("TC-RSV-024 admins can see and cancel any member's reservation", async ({ adminApi, memberApi }) => {
    const resource = await memberApi.firstActiveResource();
    const created = await (await memberApi.createReservation({ resource_id: resource.id, ...uniqueSlot() })).json();

    expect((await adminApi.get(`/api/v1/reservations/${created.data.id}`)).status()).toBe(200);
    expect((await adminApi.cancelReservation(created.data.id)).status()).toBe(200);
  });
});

/** uniqueSlot() reads the worker index from test.info(), which isn't available in beforeAll. */
function uniqueSlotOutsideTest(): { starts_at: string; ends_at: string } {
  const day = 24 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(new Date().getUTCFullYear() + 3, 0, 1) + Math.floor(Math.random() * 300) * day + (6 + Math.floor(Math.random() * 8)) * 3_600_000);
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2 * 3_600_000).toISOString() };
}
