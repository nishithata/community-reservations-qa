import js from "@eslint/js";
import tseslint from "typescript-eslint";
import playwright from "eslint-plugin-playwright";

export default tseslint.config(
  { ignores: ["node_modules", "playwright-report", "test-results", ".auth", "perf"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["tests/**/*.ts"],
    ...playwright.configs["flat/recommended"],
    rules: {
      ...playwright.configs["flat/recommended"].rules,
      // Assertions live inside page-object and helper calls in some tests.
      "playwright/expect-expect": ["warn", { assertFunctionNames: ["expectApiError", "audit", "ensureQaAccount", "saveSession"] }],
      // Conditional expectations are used deliberately in data-driven tests.
      "playwright/no-conditional-expect": "off",
      "playwright/no-conditional-in-test": "off",
      // Admin-only and browser-specific checks are skipped by design when not applicable.
      "playwright/no-skipped-test": "off",
    },
  },
);
