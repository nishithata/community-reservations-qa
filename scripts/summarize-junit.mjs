// Turns Playwright's JUnit XML into a Markdown table for the GitHub job summary.
// Usage: node scripts/summarize-junit.mjs test-results/junit.xml
import { existsSync, readFileSync } from "node:fs";

const file = process.argv[2] ?? "test-results/junit.xml";
if (!existsSync(file)) {
  console.log("No JUnit results found (tests may not have run).");
  process.exit(0);
}

const xml = readFileSync(file, "utf8");
const attr = (tag, name) => Number(new RegExp(`<${tag}[^>]*\\s${name}="(\\d+)"`).exec(xml)?.[1] ?? 0);

const tests = attr("testsuites", "tests");
const failures = attr("testsuites", "failures");
const errors = attr("testsuites", "errors");
const skipped = attr("testsuites", "skipped");
const passed = tests - failures - errors - skipped;

const failed = [...xml.matchAll(/<testcase name="([^"]+)"[^>]*>\s*<failure/g)].map((m) => m[1]);

console.log("## Playwright results\n");
console.log("| Total | Passed | Failed | Skipped |");
console.log("|---|---|---|---|");
console.log(`| ${tests} | ${passed} | ${failures + errors} | ${skipped} |\n`);
if (failed.length) {
  console.log("### Failed tests\n");
  for (const name of failed) console.log(`- ${name.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<")}`);
}
console.log("\nFull report: see the **playwright-report** artifact or the published GitHub Pages report.");
