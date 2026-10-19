# Exploratory Testing

Exploratory testing is simultaneous learning, test design, and execution, guided by a short mission (a **charter**) and time box. These sessions complemented the automated suite by probing areas where judgment matters.

**Format:** *Explore* (target) *with* (resources) *to discover* (information).

> Findings that link to an automated test case are re-verified on every CI run. The rest come from manual sessions and code review; re-check them whenever the app changes, and update these notes with what you observe.

---

## ES-01: Booking flow usability

| | |
|---|---|
| **Charter** | Explore the booking form with unusual dates, times, and rapid clicks to discover usability problems and confusing messages |
| **Time box** | 45 minutes |
| **Areas** | Date picker, start time, duration, notes, Reserve button, "My reservations" |

**Notes**

- Today's date with a time that has already passed is accepted by the form; the server rejects it with a clear message → **BUG-006**.
- The reservations table defaults to all statuses, so cancelled history mixes with live bookings → **BUG-007**.
- Double-clicking **Reserve**: the first click books, the second shows "That slot is taken". No duplicate is created. ✅ (scripted as TC-MAN-006)
- A very long note (500 characters) is accepted and wraps in the table; 501 characters returns a clear validation error. ✅
- HTML in notes is shown as text. ✅ (automated as TC-UI-022)

## ES-02: Data validation and boundaries

| | |
|---|---|
| **Charter** | Explore the API's create and update endpoints with boundary and malformed values to discover validation gaps |
| **Time box** | 60 minutes |
| **Tools** | curl, Playwright request tests |

**Notes**

- Duration limits behave exactly at 15 minutes and 8 hours (automated as TC-RSV-003). ✅
- Resource capacity `0` and negative values are rejected; `null` is allowed. ✅
- Duplicate resource names differing only in case are rejected sequentially, but the database index is case-sensitive → **BUG-004** (race window).
- Malformed JSON returns `400 invalid_json`, not a `500`. ✅
- Unknown query parameters are ignored, and invalid enum filters return `400` with the allowed values listed. ✅

## ES-03: Authentication and session security

| | |
|---|---|
| **Charter** | Explore login, sign-up, logout, and token handling to discover ways to access data you shouldn't |
| **Time box** | 60 minutes |
| **Tools** | Browser DevTools, curl, jwt.io-style decoding |

**Notes**

- Login gives the same message for an unknown email and a wrong password. ✅
- Sign-up says "Email has already been taken" → account enumeration → **BUG-001**.
- A token copied before logout still works afterwards → **BUG-002**.
- Changing the `role` claim inside the token breaks the signature (401), and the server reads the role from the database anyway. ✅
- Another member's reservation ID returns 404 for both view and cancel. ✅ (automated as TC-RSV-023)

## ES-04: Resilience and cold starts

| | |
|---|---|
| **Charter** | Explore the demo after long idle periods and on slow networks to discover confusing states |
| **Time box** | 30 minutes |
| **Tools** | Chrome DevTools network throttling ("Slow 3G"), Render dashboard |

**Notes**

- After about 15 minutes idle, the first request takes ~50 seconds; the badge shows "API waking up…" and recovers on its own. ✅
- On "Slow 3G", the resource list shows nothing while loading. A loading indicator would help (enhancement, not filed).
- When the API is unreachable, the list shows "Cannot reach the API. It may be waking up; try again in a moment." ✅
