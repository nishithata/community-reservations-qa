# Defect Reports

Defects found while designing and running this test suite against the Community Resource Reservation system. Severity follows the definitions in the [test plan](TEST_PLAN.md#9-severity-definitions).

| ID | Title | Severity | Priority | Area | Status |
|---|---|---|---|---|---|
| [BUG-001](#bug-001) | Sign-up reveals whether an email is registered | Medium | P2 | Security / API | Open |
| [BUG-002](#bug-002) | Logging out does not invalidate the access token | Medium | P3 | Security / Auth | Open (by design) |
| [BUG-003](#bug-003) | Booking rate limit omits the `Retry-After` header | Low | P3 | API | Open |
| [BUG-004](#bug-004) | Resource name uniqueness differs between app and database | Low | P3 | Data integrity | Open |
| [BUG-005](#bug-005) | Times are entered and shown only in UTC | Low | P2 | UX | Open |
| [BUG-006](#bug-006) | The booking form accepts a start time that has already passed today | Low | P3 | UX | Open |
| [BUG-007](#bug-007) | "My reservations" defaults to showing cancelled history | Low | P4 | UX | Open |

---

### BUG-001

**Sign-up reveals whether an email is registered**

| | |
|---|---|
| **Severity / Priority** | Medium / P2 |
| **Environment** | Production demo (API on Render) |
| **Found by** | TC-AUTH-005 (automated, records this as a known issue) |

**Steps to reproduce**

1. `POST /api/v1/auth/register` with `{"name":"x","email":"demo@example.com","password":"a-long-password"}`
2. `POST /api/v1/auth/register` with the same body but an unused email

**Expected:** both requests give no hint about whether the email already has an account. Login already follows this rule ("Invalid email or password").

**Actual:** step 1 returns `422` with `"email": ["Email has already been taken"]`, so anyone can test which emails are registered (account enumeration), undermining the generic login message.

**Suggested fix:** return a generic response for sign-up (e.g. "If this email can be used, you'll receive a confirmation"), or rely on rate limiting plus email verification so the response doesn't differ.

---

### BUG-002

**Logging out does not invalidate the access token**

| | |
|---|---|
| **Severity / Priority** | Medium / P3 |
| **Environment** | Production demo (UI + API) |
| **Found by** | Exploratory session ES-03 |

**Steps to reproduce**

1. Log in on the demo UI and copy the `token` value from DevTools → Application → Local Storage
2. Click **Log out**
3. `curl -H "Authorization: Bearer <copied token>" https://community-reservations-api.onrender.com/api/v1/me`

**Expected:** after logout, the token no longer works.

**Actual:** `200 OK` with the user's profile; the token stays valid until it expires (24 hours). Logout only deletes the token from the browser.

**Notes:** this is a known trade-off of stateless JWTs and is documented in the API's architecture notes. Mitigations: shorter-lived access tokens with refresh tokens, or a server-side denylist checked on each request.

---

### BUG-003

**Booking rate limit omits the `Retry-After` header**

| | |
|---|---|
| **Severity / Priority** | Low / P3 |
| **Found by** | Test design review while building the 429 handling in `ApiClient.createReservation` |

**Steps to reproduce**

1. Log in as a member
2. Send 31 `POST /api/v1/reservations` requests within one minute

**Expected:** the `429` response includes `Retry-After`, as the login and sign-up `429` responses do, so clients know how long to wait.

**Actual:** the booking `429` has no `Retry-After` header. Clients must guess; this suite falls back to waiting 61 seconds.

**Suggested fix:** set `Retry-After` in the reservations controller's `rate_limit ... with:` handler, matching `AuthController#render_rate_limited`.

---

### BUG-004

**Resource name uniqueness differs between app and database**

| | |
|---|---|
| **Severity / Priority** | Low / P3 |
| **Found by** | Exploratory session ES-02 (boundary probing of duplicate names), confirmed against the schema |

**Steps to reproduce (race condition, hard to hit manually)**

1. As an admin, send two `POST /api/v1/resources` requests at the same moment with names `Garden Shed` and `garden shed`

**Expected:** at most one is created. The API's validation treats names as case-insensitive (TC-RES-022 confirms a sequential duplicate is rejected).

**Actual (by analysis):** the database's unique index on `resources.name` is case-sensitive, so if both requests pass validation before either commits, both rows are inserted.

**Suggested fix:** make the unique index case-insensitive, e.g. `CREATE UNIQUE INDEX ... ON resources (lower(name))`.

---

### BUG-005

**Times are entered and shown only in UTC**

| | |
|---|---|
| **Severity / Priority** | Low / P2 |
| **Found by** | Manual test TC-MAN-003 |

**Steps to reproduce:** in a browser set to Pacific Time, book "10:00" for tomorrow.

**Expected:** users book in their own time zone, or the UI shows both.

**Actual:** the booking is for 10:00 **UTC** (3:00 AM Pacific). The labels say "(UTC)", but users can easily miss it and book the wrong time.

**Suggested fix:** enter and display times in the browser's time zone and convert to UTC in the client; show the UTC time as secondary text.

---

### BUG-006

**The booking form accepts a start time that has already passed today**

| | |
|---|---|
| **Severity / Priority** | Low / P3 |
| **Found by** | Exploratory session ES-01 |

**Steps to reproduce:** select today's date (UTC) and a start time earlier than the current UTC time, then click **Reserve**.

**Expected:** the form prevents choosing a past time, or warns before submitting.

**Actual:** the request is sent and the server rejects it ("Starts at must be in the future"). The error is shown correctly, so this is a polish issue, not a data issue.

---

### BUG-007

**"My reservations" defaults to showing cancelled history**

| | |
|---|---|
| **Severity / Priority** | Low / P4 |
| **Found by** | Exploratory session ES-01; also why the UI tests switch the filter to "Confirmed" |

**Expected:** the default view shows what users care about most: upcoming, confirmed reservations.

**Actual:** the default is "All statuses", ordered by start time, so cancelled bookings mix with active ones, and an active far-future booking can land on a later page.

**Suggested fix:** default the filter to "Confirmed" and upcoming, keeping "All statuses" as an option.
