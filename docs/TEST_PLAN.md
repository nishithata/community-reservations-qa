# Test Plan: Community Resource Reservation System

| | |
|---|---|
| **System under test** | Community Resource Reservation API (Ruby on Rails) and its browser demo client |
| **Environments** | Production demo: UI on Vercel, API on Render, PostgreSQL on Neon. Local: Rails + PostgreSQL |
| **Author** | Nishitha Thatha Anil |
| **Status** | Active; automated suite runs on every change and nightly |

## 1. Objectives

1. Verify that every functional requirement below behaves as specified, through the API and through the UI.
2. Prove the system's most important guarantee: **a resource can never be double-booked**, including under concurrent requests.
3. Verify security boundaries: authentication, role-based authorization, and data isolation between members.
4. Check non-functional qualities: accessibility (WCAG 2.1 AA), cross-browser and mobile behavior, performance under light load, and resilience to cold starts.
5. Report defects with clear reproduction steps and track known issues.

## 2. Requirements in scope

| ID | Requirement |
|---|---|
| **R1** | Visitors can browse active resources, filter by category, search by text, and page through results |
| **R2** | Visitors can view a resource's bookings for a given UTC day without seeing who booked |
| **R3** | Users can sign up (always as members) and log in; credentials errors don't reveal which field was wrong |
| **R4** | Protected endpoints require a valid, unexpired, correctly signed bearer token |
| **R5** | Members can book a resource for 15 minutes to 8 hours, starting in the future, on an active resource |
| **R6** | Overlapping confirmed bookings for the same resource are rejected (409); adjacent bookings are allowed |
| **R7** | Members can cancel their own upcoming bookings; cancelled bookings free the slot; cancellation is final |
| **R8** | Members see only their own reservations; other members' reservations are invisible (404) |
| **R9** | Admins can create, update, deactivate, and delete resources, and view or cancel any reservation |
| **R10** | Errors use one JSON format with machine-readable codes and field-level details |
| **R11** | The UI is usable with a keyboard and screen reader and meets WCAG 2.1 AA |
| **R12** | Public read endpoints respond quickly (p95 < 1 s) at light load |

## 3. Out of scope

- Load or stress testing beyond light load: the demo runs on free-tier hosting.
- Booking-endpoint load: it is rate limited per user by design.
- Email delivery, payments, recurring reservations (not implemented).
- Infrastructure failover of the hosting providers.

## 4. Test approach

| Level / type | How | Tooling |
|---|---|---|
| **API functional** (black box) | Contract, positive, negative, and boundary tests on every endpoint | Playwright `request` |
| **UI end to end** | User journeys through the real browser client | Playwright (Chromium; smoke on Firefox, WebKit, mobile) |
| **Security** | Token tampering, authorization decision tables, data isolation, XSS in user input, SQL wildcard injection | Playwright |
| **Concurrency** | Simultaneous booking requests for one slot | Playwright `Promise.all` |
| **Accessibility** | Automated WCAG 2.1 A/AA audit, accessible names, keyboard operation | axe-core |
| **Performance** | Ramp to 10 virtual users on read endpoints; thresholds on p95 latency and error rate | k6 |
| **Manual / exploratory** | Time-boxed charters for usability, edge cases, and risk areas | See [EXPLORATORY_TESTING.md](EXPLORATORY_TESTING.md) |
| **Regression** | Full automated suite on every push and nightly | GitHub Actions |

Test design techniques (equivalence partitioning, boundary value analysis, decision tables, state transitions, error guessing) are documented with worked examples in [TEST_DESIGN.md](TEST_DESIGN.md).

## 5. Test data strategy

- Tests run against the live demo, so they **never use the public demo account to create data**. Two dedicated QA accounts (`qa-api-bot`, `qa-ui-bot`) are created on first run.
- Each test books a **unique far-future slot** and cancels it afterwards (a fixture cancels even when the test fails). Setup also cancels any leftovers from a crashed run.
- Admin-only tests run only when the `ADMIN_PASSWORD` secret is provided.

## 6. Entry and exit criteria

**Entry:** the API health check returns `200` with `"database": "ok"`; the UI loads and reports "API online".

**Exit (release-ready):**

- 100% of `@smoke` tests pass on all browsers
- No open defects of severity **Critical** or **High**
- No serious or critical accessibility violations
- Performance thresholds met (p95 < 1 s, error rate < 1%)

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Free-tier API sleeps (~60 s cold start) | Timeouts, flaky first test | Setup warms the API; generous timeouts; UI polls until online |
| API rate limits (login 10/min/IP, booking 30/min/user, sign-up 5/10 min/IP) | 429 failures | Log in once per run; separate QA accounts; client waits and retries on 429; sign-up tests skip on 429 |
| Shared live data | Collisions between runs or with real visitors | Unique far-future slots, cleanup fixtures, one CI run at a time |
| Third-party outages (Render, Neon, Vercel) | False failures | Health check gate; retries once in CI; failures include traces |

## 8. Deliverables

- Automated test suite (this repository) with HTML, JUnit, and job-summary reports
- [Test case catalog with traceability](TEST_CASES.md)
- [Test design techniques](TEST_DESIGN.md)
- [Exploratory testing charters and notes](EXPLORATORY_TESTING.md)
- [Defect reports](BUG_REPORTS.md)
- [Test summary report](TEST_REPORT.md)

## 9. Severity definitions

| Severity | Meaning |
|---|---|
| **Critical** | Data loss, security breach, or the core flow (booking) is unusable |
| **High** | A major feature is broken with no workaround |
| **Medium** | A feature misbehaves but has a workaround, or a security weakness with limited impact |
| **Low** | Cosmetic, minor inconsistency, or a hardening opportunity |
