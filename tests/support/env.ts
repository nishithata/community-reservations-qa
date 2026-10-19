// Targets default to the live demo; override to test another environment, e.g.
//   API_URL=http://localhost:3000 UI_URL=http://localhost:8091 npx playwright test
export const API_URL = (process.env.API_URL || "https://community-reservations-api.onrender.com").replace(/\/+$/, "");
export const UI_URL = (process.env.UI_URL || "https://community-reservations-api-web.vercel.app").replace(/\/+$/, "");

export const MEMBER = {
  email: process.env.MEMBER_EMAIL || "demo@example.com",
  password: process.env.MEMBER_PASSWORD || "demo-password-123",
};

// Dedicated QA accounts used for everything that creates data, so test bookings
// never clutter the public demo account. Setup registers them on first use.
const QA_PASSWORD = process.env.QA_PASSWORD || "qa-automation-password";
export const QA_API_USER = { name: "QA API Bot", email: process.env.QA_API_EMAIL || "qa-api-bot@example.com", password: QA_PASSWORD };
export const QA_UI_USER = { name: "QA Browser Bot", email: process.env.QA_UI_EMAIL || "qa-ui-bot@example.com", password: QA_PASSWORD };

// Admin tests run only when the admin password is provided (a CI secret).
export const ADMIN = {
  email: process.env.ADMIN_EMAIL || "admin@example.com",
  password: process.env.ADMIN_PASSWORD || "",
};

export const AUTH_DIR = ".auth";
/** Session of the QA API account (a member). */
export const MEMBER_STATE = `${AUTH_DIR}/member.json`;
export const ADMIN_STATE = `${AUTH_DIR}/admin.json`;
/** Session of the QA browser account; separate so UI tests have their own booking rate-limit budget. */
export const UI_USER_STATE = `${AUTH_DIR}/ui-user.json`;
