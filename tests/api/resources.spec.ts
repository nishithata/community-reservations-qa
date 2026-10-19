import { test, expect } from "../support/fixtures";
import { expectApiError, type PageMeta, type Resource } from "../support/api-client";

const CATEGORIES = ["room", "equipment", "space", "vehicle"] as const;

test.describe("Resources catalog (public)", () => {
  test("TC-RES-001 listing is public, paginated, and matches the contract @smoke", async ({ api }) => {
    const response = await api.get("/api/v1/resources");

    expect(response.status()).toBe(200);
    const { data, meta } = (await response.json()) as { data: Resource[]; meta: PageMeta };
    expect(data.length).toBeGreaterThan(0);
    expect(meta).toEqual({
      page: 1,
      per_page: 20,
      total_count: expect.any(Number),
      total_pages: expect.any(Number),
      next_page: null,
      prev_page: null,
    });
    for (const resource of data) {
      expect(resource).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        category: expect.stringMatching(/^(room|equipment|space|vehicle)$/),
        active: true, // anonymous callers never see inactive resources
      });
    }
  });

  test("TC-RES-002 results are sorted by name", async ({ api }) => {
    const { data } = (await (await api.get("/api/v1/resources")).json()) as { data: Resource[] };
    const names = data.map((r) => r.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  });

  // Equivalence partitioning: every valid category is one class, anything else is the invalid class.
  for (const category of CATEGORIES) {
    test(`TC-RES-003 filtering by category "${category}" returns only that category`, async ({ api }) => {
      const response = await api.get("/api/v1/resources", { category });

      expect(response.status()).toBe(200);
      const { data } = (await response.json()) as { data: Resource[] };
      expect(data.every((r) => r.category === category)).toBe(true);
    });
  }

  test("TC-RES-004 an unknown category is rejected with 400", async ({ api }) => {
    await expectApiError(await api.get("/api/v1/resources", { category: "spaceship" }), 400, "bad_request");
  });

  test("TC-RES-005 search is case-insensitive across name and description", async ({ api }) => {
    const { data: all } = (await (await api.get("/api/v1/resources")).json()) as { data: Resource[] };
    const target = all[0];
    const term = target.name.split(" ")[0].toUpperCase();

    const { data } = (await (await api.get("/api/v1/resources", { q: term })).json()) as { data: Resource[] };
    expect(data.map((r) => r.id)).toContain(target.id);
  });

  test("TC-RES-006 SQL wildcard characters in search are treated literally", async ({ api }) => {
    for (const q of ["%", "_", "%' OR '1'='1"]) {
      const response = await api.get("/api/v1/resources", { q });
      expect(response.status(), `q=${q}`).toBe(200);
      expect((await response.json()).data, `q=${q} must not match everything`).toEqual([]);
    }
  });

  // Boundary value analysis on per_page (default 20, min 1, max 100).
  const perPageCases: [string, number][] = [
    ["1", 1],
    ["2", 2],
    ["100", 100],
    ["101", 100],
    ["1000", 100],
    ["0", 20],
    ["abc", 20],
  ];
  for (const [input, expected] of perPageCases) {
    test(`TC-RES-007 per_page=${input} resolves to ${expected}`, async ({ api }) => {
      const { meta } = await (await api.get("/api/v1/resources", { per_page: input })).json();
      expect(meta.per_page).toBe(expected);
    });
  }

  test("TC-RES-008 paging through results returns every resource exactly once", async ({ api }) => {
    const first = await (await api.get("/api/v1/resources", { per_page: 2, page: 1 })).json();
    const seen: number[] = first.data.map((r: Resource) => r.id);
    let next: number | null = first.meta.next_page;
    while (next) {
      const page = await (await api.get("/api/v1/resources", { per_page: 2, page: next })).json();
      seen.push(...page.data.map((r: Resource) => r.id));
      next = page.meta.next_page;
    }

    expect(seen).toHaveLength(first.meta.total_count);
    expect(new Set(seen).size).toBe(seen.length);
  });

  test("TC-RES-009 a page past the end returns an empty list, not an error", async ({ api }) => {
    const response = await api.get("/api/v1/resources", { page: 9999 });

    expect(response.status()).toBe(200);
    expect((await response.json()).data).toEqual([]);
  });

  test("TC-RES-010 show returns a resource; unknown ids return 404", async ({ api }) => {
    const resource = await api.firstActiveResource("room");
    const response = await api.get(`/api/v1/resources/${resource.id}`);
    expect(response.status()).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: resource.id, name: resource.name });

    await expectApiError(await api.get("/api/v1/resources/999999999"), 404, "not_found");
  });

  test("TC-RES-011 availability lists bookings without exposing who booked", async ({ api }) => {
    const resource = await api.firstActiveResource("room");
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const response = await api.get(`/api/v1/resources/${resource.id}/availability`, { date });

    expect(response.status()).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ resource_id: resource.id, date, bookings: expect.any(Array) });
    for (const booking of data.bookings) {
      expect(Object.keys(booking).sort()).toEqual(["ends_at", "starts_at"]);
    }
  });

  for (const date of ["", "tomorrow", "2026-13-01", "2026-02-30"]) {
    test(`TC-RES-012 availability rejects date="${date}" with 400`, async ({ api }) => {
      const resource = await api.firstActiveResource("room");
      const response = await api.get(`/api/v1/resources/${resource.id}/availability`, date ? { date } : undefined);
      await expectApiError(response, 400, "bad_request");
    });
  }
});

// Decision table: who may change the catalog?
//              anonymous   member   admin
//   create       401        403     201
//   update       401        403     200
//   delete       401        403     204 / 409
test.describe("Resources catalog (write access)", () => {
  test("TC-RES-020 anonymous callers cannot create resources", async ({ api }) => {
    await expectApiError(await api.post("/api/v1/resources", { resource: { name: "X", category: "room" } }), 401, "unauthorized");
  });

  test("TC-RES-021 members cannot create, update, or delete resources", async ({ memberApi }) => {
    const resource = await memberApi.firstActiveResource("room");

    await expectApiError(await memberApi.post("/api/v1/resources", { resource: { name: "X", category: "room" } }), 403, "forbidden");
    await expectApiError(await memberApi.patch(`/api/v1/resources/${resource.id}`, { resource: { capacity: 1 } }), 403, "forbidden");
    await expectApiError(await memberApi.delete(`/api/v1/resources/${resource.id}`), 403, "forbidden");
  });

  test("TC-RES-022 admin full lifecycle: create, validate, update, deactivate, delete", async ({ adminApi, api }) => {
    const name = `QA Tent ${Date.now()}`;

    const invalid = await adminApi.post("/api/v1/resources", { resource: { name: "", category: "spaceship", capacity: 0 } });
    const errors = await expectApiError(invalid, 422, "validation_failed");
    expect(Object.keys(errors.error.details ?? {}).sort()).toEqual(["capacity", "category", "name"]);

    const created = await adminApi.post("/api/v1/resources", { resource: { name, category: "equipment", capacity: 4 } });
    expect(created.status()).toBe(201);
    const { data: resource } = await created.json();
    expect(created.headers()["location"]).toContain(`/api/v1/resources/${resource.id}`);

    try {
      const duplicate = await adminApi.post("/api/v1/resources", { resource: { name: name.toUpperCase(), category: "room" } });
      await expectApiError(duplicate, 422, "validation_failed");

      const updated = await adminApi.patch(`/api/v1/resources/${resource.id}`, { resource: { capacity: 6, active: false } });
      expect(updated.status()).toBe(200);
      expect((await updated.json()).data).toMatchObject({ capacity: 6, active: false });

      // Inactive resources disappear for the public but stay visible to admins.
      await expectApiError(await api.get(`/api/v1/resources/${resource.id}`), 404, "not_found");
      expect((await adminApi.get(`/api/v1/resources/${resource.id}`)).status()).toBe(200);
    } finally {
      expect((await adminApi.delete(`/api/v1/resources/${resource.id}`)).status()).toBe(204);
    }
  });

  test("TC-RES-023 resources with booking history cannot be deleted (409)", async ({ adminApi }) => {
    const { data } = await (await adminApi.get("/api/v1/resources", { q: "Study Room" })).json();
    test.skip(data.length === 0, "seeded Study Room not found");

    await expectApiError(await adminApi.delete(`/api/v1/resources/${data[0].id}`), 409, "conflict");
  });
});
