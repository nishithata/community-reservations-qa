// k6 load test for the public, read-only API endpoints.
//
//   k6 run perf/load-test.js
//   k6 run -e API_URL=http://localhost:3000 perf/load-test.js
//
// Deliberately gentle (max 10 virtual users, read-only) because the target is a
// free-tier demo. Booking endpoints are excluded: they write data and are rate
// limited per user, so load-testing them would measure the limiter, not the API.
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const API_URL = (__ENV.API_URL || "https://community-reservations-api.onrender.com").replace(/\/+$/, "");

export const errors = new Rate("errors");
export const listLatency = new Trend("resources_list_duration", true);

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 5 }, // ramp up
        { duration: "45s", target: 10 }, // steady load
        { duration: "15s", target: 0 }, // ramp down
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // < 1% failed requests
    errors: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"], // 95% of requests under 1s
    resources_list_duration: ["p(95)<800"],
  },
};

// Wake the free-tier API before measuring, so the cold start isn't counted.
export function setup() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = http.get(`${API_URL}/api/v1/health`, { timeout: "30s" });
    if (response.status === 200) return;
    sleep(5);
  }
  throw new Error("API did not become healthy");
}

export default function () {
  group("list resources", () => {
    const response = http.get(`${API_URL}/api/v1/resources?per_page=20`);
    listLatency.add(response.timings.duration);
    const ok = check(response, {
      "status is 200": (r) => r.status === 200,
      "has data array": (r) => Array.isArray(r.json("data")),
    });
    errors.add(!ok);
  });

  group("filter and search", () => {
    const category = ["room", "equipment", "space", "vehicle"][Math.floor(Math.random() * 4)];
    const response = http.get(`${API_URL}/api/v1/resources?category=${category}&q=a`);
    errors.add(!check(response, { "filter status is 200": (r) => r.status === 200 }));
  });

  group("check availability", () => {
    const list = http.get(`${API_URL}/api/v1/resources?per_page=5`);
    const ids = (list.json("data") || []).map((r) => r.id);
    if (ids.length === 0) return;
    const id = ids[Math.floor(Math.random() * ids.length)];
    const date = new Date(Date.now() + 86400000 * (1 + Math.floor(Math.random() * 14))).toISOString().slice(0, 10);
    const response = http.get(`${API_URL}/api/v1/resources/${id}/availability?date=${date}`);
    errors.add(!check(response, { "availability status is 200": (r) => r.status === 200 }));
  });

  sleep(1 + Math.random() * 2); // think time between user actions
}

export function handleSummary(data) {
  const m = data.metrics;
  const fmt = (v) => (v === undefined ? "n/a" : `${v.toFixed(0)} ms`);
  const lines = [
    "## k6 load test summary",
    "",
    `| Metric | Value |`,
    `|---|---|`,
    `| Requests | ${m.http_reqs.values.count} |`,
    `| Failed requests | ${(m.http_req_failed.values.rate * 100).toFixed(2)}% |`,
    `| p50 latency | ${fmt(m.http_req_duration.values.med)} |`,
    `| p95 latency | ${fmt(m.http_req_duration.values["p(95)"])} |`,
    `| p95 resource list | ${fmt(m.resources_list_duration.values["p(95)"])} |`,
    `| Max VUs | ${m.vus_max.values.max} |`,
    "",
  ].join("\n");
  return { stdout: lines, "perf-summary.md": lines, "perf-summary.json": JSON.stringify(data, null, 2) };
}
