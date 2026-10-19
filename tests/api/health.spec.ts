import { test, expect } from "../support/fixtures";

test.describe("Health and routing", () => {
  test("TC-API-001 health endpoint reports a healthy database @smoke", async ({ api }) => {
    const response = await api.get("/api/v1/health");

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", database: "ok", time: expect.any(String) });
  });

  test("TC-API-002 liveness probe responds", async ({ api }) => {
    expect((await api.get("/up")).status()).toBe(200);
  });

  test("TC-API-003 root endpoint describes the API", async ({ api }) => {
    const response = await api.get("/");

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ version: "v1", resources: expect.stringContaining("/api/v1/resources") });
  });

  test("TC-API-004 unknown API routes return a JSON 404", async ({ api }) => {
    const response = await api.get("/api/v1/this-route-does-not-exist");

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect((await response.json()).error.code).toBe("not_found");
  });

  test("TC-API-005 responses carry security-relevant headers", async ({ api }) => {
    const response = await api.get("/api/v1/health");
    const headers = response.headers();

    expect(headers["content-type"]).toContain("application/json");
    expect(headers["x-request-id"], "every response should be traceable in logs").toBeTruthy();
  });
});
