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
| [BUG-008](#bug-008) | Malformed JSON is reported as a missing parameter | Low | P3 | API | Open |
| [BUG-009](#bug-009) | Status badge and category tags fail WCAG AA color contrast | Medium | P2 | Accessibility | **Fixed** |
| [BUG-010](#bug-010) | On phones the page is wider than the screen and taps hit the wrong card | High | P1 | UI / mobile | **Fixed** |

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

---

### BUG-008

**Malformed JSON is reported as a missing parameter**

| | |
|---|---|
| **Severity / Priority** | Low / P3 |
| **Environment** | Production demo (API on Render) |
| **Found by** | TC-RSV-008, first CI run against production |

**Steps to reproduce**

```bash
curl -X POST https://community-reservations-api.onrender.com/api/v1/reservations \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  --data '{not json'
```

**Expected:** `400` with `"code": "invalid_json"` and "Request body is not valid JSON", as the API documentation states and the API's own test suite asserts.

**Actual:** `400` with `"code": "bad_request"` and "param is missing or the value is empty". The status is correct, but the message sends a developer looking for a missing field instead of a syntax error.

**Analysis:** Rails' JSON parameter wrapping swallows the parse error before the controller sees it, so the request continues with empty parameters and fails the required-parameter check instead. The API's local test environment does not reproduce this, which is why only testing the deployed system caught it.

**Suggested fix:** detect unparseable JSON bodies before parameter wrapping (e.g. disable `wrap_parameters` for JSON or check `request.raw_post` when parameters are empty) and return `invalid_json`. Add a request test that mirrors production middleware.

---

### BUG-009

**Status badge and category tags fail WCAG AA color contrast**

| | |
|---|---|
| **Severity / Priority** | Medium / P2 |
| **Found by** | TC-A11Y-001 and TC-A11Y-002 (axe-core), first CI run |
| **Status** | **Fixed** in [`be1bc01`](https://github.com/nishithata/community-reservations-api/commit/be1bc01); verified by the next CI run |

**Actual (before fix):** three elements on the home page were below the WCAG 2.1 AA minimum of 4.5:1 for small text:

| Element | Colors | Contrast |
|---|---|---|
| "API online" badge | `#1f8a4c` on `#e6f6ec` | 3.9:1 |
| "Equipment" category tags (×2) | `#b4610b` on `#fff4e5` | 4.2:1 |
| "Inactive" tag (admins only) | `#667085` on `#f0f1f4` | 4.4:1 |

**Fix:** darkened the text colors to `#17733f` (5.3:1), `#8f4d08` (6.0:1), and `#556070` (5.7:1). The shared green also backs the white "success" toast, which now passes too.

---

### BUG-010

**On phones the page is wider than the screen and taps hit the wrong card**

| | |
|---|---|
| **Severity / Priority** | High / P1 (the core flow was unreliable on mobile) |
| **Environment** | Pixel 7 viewport (412 px), logged in |
| **Found by** | TC-UI-020 on the `ui-mobile` project, first CI run |
| **Status** | **Fixed** in [`be1bc01`](https://github.com/nishithata/community-reservations-api/commit/be1bc01); verified by the next CI run |

**Steps to reproduce (before fix):** on a phone, log in so "My reservations" appears, then tap a resource card such as "Study Room A".

**Expected:** the tapped card opens.

**Actual:** the page was wider than the screen, the browser zoomed out, and taps landed on neighboring cards. Playwright's log showed other cards "intercepting pointer events" at the tap point.

**Root cause:** on narrow screens the layout used `grid-template-columns: 1fr`. A `1fr` grid column is at least as wide as its widest content, so the six-column reservations table stretched the whole page instead of scrolling inside its card.

**Fix:** `minmax(0, 1fr)` for the mobile column and `min-width: 0` on cards, so the table scrolls within its card. TC-MAN-001 (layout at narrow widths) covers the same behavior manually.
