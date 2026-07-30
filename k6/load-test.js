import http from "k6/http";
import { check, sleep } from "k6";

// A real Aqlis visitor loads the watchlist, then looks at one company's
// ratio breakdown, then pauses before doing anything else — this is a
// LOAD test (realistic usage shape) not a STRESS test (find the
// breaking point), so the script models that shape deliberately rather
// than hammering every endpoint in a tight loop.
export const options = {
  scenarios: {
    dashboard_browsing: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 }, // ramp up
        { duration: "1m", target: 20 }, // hold — this is where p95 stabilizes
        { duration: "30s", target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    // Loose enough not to false-fail on Neon's connection-pooler
    // latency, tight enough to catch a real regression.
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// Matches the watchlist seeded in Phase 8 — kept in sync by hand since
// k6 scripts can't import the project's own TS constants.
const SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "XOM", "JNJ", "JPM", "BAC", "MGM", "T"];

export default function () {
  const companiesRes = http.get(`${BASE_URL}/api/companies`);
  check(companiesRes, {
    "GET /api/companies returns 200": (r) => r.status === 200,
  });

  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const verdictRes = http.get(`${BASE_URL}/api/companies/${symbol}/verdict`);
  check(verdictRes, {
    "GET /api/companies/:symbol/verdict returns 200": (r) => r.status === 200,
  });

  sleep(1);
}
