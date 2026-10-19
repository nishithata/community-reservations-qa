import { test, expect } from "../support/fixtures";
import { expectApiError } from "../support/api-client";
import { API_URL, MEMBER, QA_API_USER } from "../support/env";
import { uniqueEmail } from "../support/test-data";

// Login and sign-up are rate limited per IP (10 logins/min, 5 sign-ups/10 min),
// so this file deliberately keeps the number of auth calls small.
test.describe("Authentication", () => {
  test("TC-AUTH-001 valid credentials return a bearer token and the user @smoke", async ({ api }) => {
    const response = await api.post("/api/v1/auth/login", MEMBER);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      token: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/), // header.payload.signature
      token_type: "Bearer",
      expires_in: 86_400,
      user: { email: MEMBER.email, role: "member" },
    });
    expect(body.user).not.toHaveProperty("password_digest");
  });

  test("TC-AUTH-002 wrong password is rejected with a generic message", async ({ api }) => {
    const response = await api.post("/api/v1/auth/login", { email: MEMBER.email, password: "wrong-password" });

    const body = await expectApiError(response, 401, "unauthorized");
    expect(body.error.message).toBe("Invalid email or password");
  });

  test("TC-AUTH-003 unknown email gets the same response as a wrong password", async ({ api }) => {
    const response = await api.post("/api/v1/auth/login", { email: uniqueEmail("nobody"), password: "whatever-123" });

    const body = await expectApiError(response, 401, "unauthorized");
    expect(body.error.message, "login must not reveal which emails exist").toBe("Invalid email or password");
  });

  test("TC-AUTH-004 sign-up creates a member and ignores a self-assigned admin role", async ({ api }) => {
    const email = uniqueEmail();
    const response = await api.post("/api/v1/auth/register", {
      name: "QA Automation",
      email: email.toUpperCase(),
      password: "a-long-password",
      role: "admin",
    });

    test.skip(response.status() === 429, "sign-up rate limit reached (5 per 10 minutes); rerun later");
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.user).toMatchObject({ email: email.toLowerCase(), role: "member" });
    expect(body.token).toBeTruthy();
  });

  test("TC-AUTH-005 sign-up returns field-level validation errors", async ({ api }) => {
    // Uses an email that is already registered to also record known issue BUG-001.
    const response = await api.post("/api/v1/auth/register", { name: "", email: MEMBER.email, password: "short" });
    test.skip(response.status() === 429, "sign-up rate limit reached (5 per 10 minutes); rerun later");

    const body = await expectApiError(response, 422, "validation_failed");
    expect(Object.keys(body.error.details ?? {}).sort()).toEqual(["email", "name", "password"]);
    expect(body.error.details?.password[0]).toContain("minimum is 8 characters");

    test.info().annotations.push({
      type: "known issue",
      description: "BUG-001: sign-up reveals that an email is registered (\"Email has already been taken\") while login hides it",
    });
    expect(body.error.details?.email).toContain("Email has already been taken");
  });

  test.describe("token validation on a protected endpoint", () => {
    const cases: [string, Record<string, string>, string][] = [
      ["TC-AUTH-006 missing token", {}, "Authentication required"],
      ["TC-AUTH-007 malformed token", { Authorization: "Bearer not-a-jwt" }, "Token is invalid"],
      ["TC-AUTH-008 wrong scheme", { Authorization: "Basic dXNlcjpwYXNz" }, "Authentication required"],
      [
        "TC-AUTH-009 forged signature",
        // A syntactically valid HS256 JWT for user 1, signed with a key the server doesn't know.
        {
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEsImV4cCI6NDEwMjQ0NDgwMH0.6f0yGQfG1R8b0rBcK4yR2wq3YF5o0bW6v9Yt1hHk2xE",
        },
        "Token is invalid",
      ],
    ];

    for (const [title, headers, message] of cases) {
      test(`${title} returns 401`, async ({ request }) => {
        const response = await request.get(`${API_URL}/api/v1/me`, { headers });

        const body = await expectApiError(response, 401, "unauthorized");
        expect(body.error.message).toBe(message);
        expect(response.headers()["www-authenticate"]).toContain("Bearer");
      });
    }
  });

  test("TC-AUTH-010 /me returns the token's user without sensitive fields", async ({ memberApi }) => {
    const response = await memberApi.get("/api/v1/me");

    expect(response.status()).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ email: QA_API_USER.email, role: "member" });
    expect(Object.keys(data).sort()).toEqual(["created_at", "email", "id", "name", "role"]);
  });
});
