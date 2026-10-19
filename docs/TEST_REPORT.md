# Test Summary Report

| | |
|---|---|
| **System under test** | Community Resource Reservations: UI (Vercel), API (Render), PostgreSQL (Neon) |
| **Build tested** | API/UI commit [`be1bc01`](https://github.com/nishithata/community-reservations-api/commit/be1bc01) |
| **Test run** | GitHub Actions, October 19, 2026 (QA commit `6b6cec2`) |
| **Result** | ✅ **Pass**: exit criteria met |

The always-current HTML report from the latest run is published at **https://nishithata.github.io/community-reservations-qa/** (once GitHub Pages is enabled for the repository).

## Results

| Project | Tests | Result |
|---|---|---|
| Setup (wake API, sessions, cleanup) | 5 | 4 passed, 1 skipped (admin login) |
| API | 70 | passed, except 3 admin-only checks skipped |
| UI, Chromium (full suite) | 14 | passed, except 1 admin-only check skipped |
| UI, Firefox / WebKit / Pixel 7 (`@smoke`) | 6 | passed |
| Accessibility (axe-core, WCAG 2.1 AA) | 4 | passed |
| **Total** | **99** | **0 failed**, 5 skipped |
| Performance (k6, 10 virtual users) | 1 scenario | thresholds met: p95 < 1 s, error rate < 1% |

Skipped tests need the `ADMIN_PASSWORD` repository secret; they run automatically once it is added.

## Exit criteria

| Criterion | Status |
|---|---|
| 100% of `@smoke` tests pass on all browsers | ✅ |
| No open Critical or High defects | ✅ (BUG-010, High, fixed and verified) |
| No serious or critical accessibility violations | ✅ (BUG-009 fixed and verified) |
| Performance thresholds met | ✅ |

## How we got here

The first full run against production found **three new defects** that the API's own test suite had not caught:

| Defect | Found by | Outcome |
|---|---|---|
| [BUG-010](BUG_REPORTS.md#bug-010) Page wider than phone screens; taps hit the wrong card | TC-UI-020 on Pixel 7 | Root-caused to a CSS grid `1fr` column, fixed in `be1bc01`, passing |
| [BUG-009](BUG_REPORTS.md#bug-009) Badge and tags below WCAG AA contrast | TC-A11Y-001/002 | Colors darkened in `be1bc01`, passing |
| [BUG-008](BUG_REPORTS.md#bug-008) Malformed JSON reported as a missing parameter | TC-RSV-008 | Open; status code is correct (400), message is misleading; tracked as a known issue |

Two failures in that run were problems in the tests themselves (an ambiguous `Name` selector and a missing ESLint setting); both were fixed.

## Open defects

| ID | Severity | Summary |
|---|---|---|
| BUG-001 | Medium | Sign-up reveals registered emails |
| BUG-002 | Medium | Logout doesn't invalidate the token (by design) |
| BUG-003 | Low | Booking 429 lacks `Retry-After` |
| BUG-004 | Low | Case-sensitive unique index on resource names |
| BUG-005 | Low | Times only in UTC |
| BUG-006 | Low | Past start time accepted by the form |
| BUG-007 | Low | Reservation list defaults to all statuses |
| BUG-008 | Low | Malformed JSON message |

## Recommendation

The system is fit for its purpose as a public demo. Before a production launch, fix **BUG-001** (account enumeration) and **BUG-002** (token revocation), and re-run the full suite.
