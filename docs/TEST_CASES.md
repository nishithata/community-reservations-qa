# Test Case Catalog

Every automated test's title starts with its ID, so a failure in the report maps straight back to this table. **Type:** A = automated, M = manual.

## Traceability matrix

| Requirement | Test cases |
|---|---|
| R1 Browse, filter, search, paginate | TC-RES-001 to 009, TC-UI-001 to 004, TC-MAN-001 |
| R2 Availability without identities | TC-RES-011, 012, TC-UI-005 |
| R3 Sign-up and login | TC-AUTH-001 to 005, TC-UI-010 to 012 |
| R4 Token validation | TC-AUTH-006 to 010 |
| R5 Booking rules | TC-RSV-001 to 009, TC-UI-020, TC-MAN-003 |
| R6 No double bookings | TC-RSV-010 to 012, TC-UI-021 |
| R7 Cancellation lifecycle | TC-RSV-020, TC-UI-020 |
| R8 Data isolation | TC-RSV-021, 023 |
| R9 Admin capabilities | TC-RES-022, 023, TC-RSV-024, TC-UI-030 |
| R10 Error format | Every negative API test (asserted by `expectApiError`) |
| R11 Accessibility | TC-A11Y-001 to 004, TC-MAN-004 |
| R12 Performance | k6 load test (`perf/load-test.js`) |
| Security (cross-cutting) | TC-AUTH-002/003/006-009, TC-RES-006, TC-RSV-002, TC-RSV-023, TC-UI-022, TC-UI-023 |

## API: health and routing

| ID | Title | Technique | Type | Expected |
|---|---|---|---|---|
| TC-API-001 | Health endpoint reports a healthy database | Smoke | A | 200, `status: ok`, `database: ok` |
| TC-API-002 | Liveness probe responds | Smoke | A | 200 |
| TC-API-003 | Root endpoint describes the API | Contract | A | 200 with links |
| TC-API-004 | Unknown API routes return JSON 404 | Error guessing | A | 404 JSON, `not_found` |
| TC-API-005 | Responses carry a request ID | Non-functional | A | `X-Request-Id` header present |

## API: authentication

| ID | Title | Technique | Type | Expected |
|---|---|---|---|---|
| TC-AUTH-001 | Valid credentials return a token and user | EP (valid class) | A | 200, JWT, no password digest |
| TC-AUTH-002 | Wrong password rejected generically | EP (invalid class) | A | 401 "Invalid email or password" |
| TC-AUTH-003 | Unknown email gets the same response | EP, security | A | identical 401 |
| TC-AUTH-004 | Sign-up creates a member; self-assigned admin ignored | Error guessing (mass assignment) | A | 201, role `member`, email lowercased |
| TC-AUTH-005 | Sign-up returns field-level errors | Negative | A | 422 with `name`, `email`, `password` details |
| TC-AUTH-006 | Missing token | EP | A | 401 "Authentication required" |
| TC-AUTH-007 | Malformed token | Error guessing | A | 401 "Token is invalid" |
| TC-AUTH-008 | Wrong auth scheme (Basic) | EP | A | 401 |
| TC-AUTH-009 | Forged signature | Security | A | 401 "Token is invalid" |
| TC-AUTH-010 | `/me` exposes no sensitive fields | Contract | A | exactly `id, name, email, role, created_at` |

## API: resources

| ID | Title | Technique | Type | Expected |
|---|---|---|---|---|
| TC-RES-001 | Listing is public, paginated, matches contract | Contract | A | 200, `meta` block, only active |
| TC-RES-002 | Results sorted by name | Functional | A | alphabetical |
| TC-RES-003 | Filter by each valid category | EP | A | only that category |
| TC-RES-004 | Unknown category rejected | EP (invalid) | A | 400 |
| TC-RES-005 | Search is case-insensitive | Functional | A | match found |
| TC-RES-006 | SQL wildcards treated literally | Error guessing, security | A | empty results, no error |
| TC-RES-007 | `per_page` boundaries | BVA | A | see TEST_DESIGN |
| TC-RES-008 | Paging returns each resource exactly once | Functional | A | no gaps, no duplicates |
| TC-RES-009 | Page past the end | Error guessing | A | 200, empty list |
| TC-RES-010 | Show; unknown ID returns 404 | Positive / negative | A | 200 / 404 |
| TC-RES-011 | Availability hides who booked | Security, contract | A | only `starts_at`, `ends_at` |
| TC-RES-012 | Availability rejects bad dates | EP (invalid) | A | 400 |
| TC-RES-020 | Anonymous cannot create | Decision table | A | 401 |
| TC-RES-021 | Members cannot create/update/delete | Decision table | A | 403 |
| TC-RES-022 | Admin lifecycle: validate, create, duplicate, update, deactivate, delete | Decision table, state | A | 422 / 201 / 422 / 200 / 404 public / 204 |
| TC-RES-023 | Resources with bookings can't be deleted | Negative | A | 409 |

## API: reservations

| ID | Title | Technique | Type | Expected |
|---|---|---|---|---|
| TC-RSV-001 | Member books a free slot | Positive | A | 201, `Location` header |
| TC-RSV-002 | Server assigns owner and status | Error guessing (mass assignment) | A | own user, `confirmed` |
| TC-RSV-003 | Duration 14 min / 15 min / 8 h / 8 h 1 min | BVA | A | 422 / 201 / 201 / 422 |
| TC-RSV-004 | End before start | Negative | A | 422, `ends_at` error |
| TC-RSV-005 | Start in the past | Negative | A | 422, `starts_at` error |
| TC-RSV-006 | Missing or unparseable times | EP (invalid) | A | 422 |
| TC-RSV-007 | Unknown resource | Negative | A | 422, not 500 |
| TC-RSV-008 | Missing payload; malformed JSON | Error guessing | A | 400 / 400 |
| TC-RSV-009 | Anonymous cannot book | Decision table | A | 401 |
| TC-RSV-010 | Overlap decision table (7 cases) | Decision table | A | 409 ×5, 201 ×2 |
| TC-RSV-011 | Same slot, different resource | EP | A | 201 both |
| TC-RSV-012 | 6 concurrent requests for one slot | Concurrency | A | exactly one 201 |
| TC-RSV-020 | Cancel frees the slot; cancel twice fails | State transition | A | 200, 422, rebook 201 |
| TC-RSV-021 | Listing shows only mine, ordered, filterable | Security, functional | A | own rows, sorted |
| TC-RSV-022 | Invalid filters | EP (invalid) | A | 400 |
| TC-RSV-023 | Another member's reservation is invisible | Security | A | 404 on view and cancel |
| TC-RSV-024 | Admin sees and cancels any reservation | Decision table | A | 200 |

## UI (end to end)

| ID | Title | Browsers | Type |
|---|---|---|---|
| TC-UI-001 | Home loads, API online, resources listed `@smoke` | Chromium, Firefox, WebKit, mobile | A |
| TC-UI-002 | Search narrows the list | Chromium | A |
| TC-UI-003 | Category filter | Chromium | A |
| TC-UI-004 | Empty search state | Chromium | A |
| TC-UI-005 | Resource details and availability; booking requires login | Chromium | A |
| TC-UI-006 | Visitors who try to book are told to log in | Chromium | A |
| TC-UI-010 | Demo account login shows the session | Chromium | A |
| TC-UI-011 | Wrong password shows an error | Chromium | A |
| TC-UI-012 | Sign-up form toggles and shows a name field | Chromium | A |
| TC-UI-020 | Book, verify in availability and list, cancel `@smoke` | Chromium, Firefox, WebKit, mobile | A |
| TC-UI-021 | Booking a taken slot shows a conflict message | Chromium | A |
| TC-UI-022 | Notes render as text, never HTML (XSS) | Chromium | A |
| TC-UI-023 | Logout clears the session | Chromium | A |
| TC-UI-030 | Admin adds a resource | Chromium (needs admin secret) | A |

## Accessibility

| ID | Title | Type |
|---|---|---|
| TC-A11Y-001 | Home (visitor): no serious/critical WCAG 2.1 AA violations | A |
| TC-A11Y-002 | Booking view (member): no serious/critical violations | A |
| TC-A11Y-003 | Every form control has an accessible name | A |
| TC-A11Y-004 | A resource can be opened with the keyboard alone | A |

## Manual test cases

| ID | Title | Steps | Expected |
|---|---|---|---|
| TC-MAN-001 | Layout at narrow widths | Resize the browser from 1280 px down to 360 px; repeat on a phone | Cards reflow to one column; no horizontal scrolling except the reservations table, which scrolls inside its card |
| TC-MAN-002 | Cold-start experience | Open the demo after 20+ minutes idle | Badge shows "API waking up…" and switches to "API online" within ~60 s without a reload |
| TC-MAN-003 | Time zone clarity | As a user in a non-UTC time zone, book "10:00" | The booking shows 10:00 UTC; labels make the UTC basis clear (see BUG-005) |
| TC-MAN-004 | Screen reader pass | Navigate with VoiceOver: log in, pick a resource, book, cancel | Every control is announced with a meaningful name; toasts are announced |
| TC-MAN-005 | Session expiry | Log in, then remove or corrupt the token in DevTools → Application → Local Storage, and act | The app shows "Your session expired" and returns to the login form |
| TC-MAN-006 | Double-click on Reserve | Double-click **Reserve** quickly | Only one booking is created; the second click shows the conflict message |
