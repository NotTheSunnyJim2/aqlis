import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, type PortfolioComparisonCache } from "../src/app.js";

const cache: PortfolioComparisonCache = {
  halalSymbols: ["AAPL", "MSFT"],
  conventionalSymbols: ["AAPL", "MSFT", "JPM"],
  halal: {
    percentilesByDay: [{ day: 0, p5: 1, p25: 1, p50: 1, p75: 1, p95: 1 }],
    finalValue: { mean: 1.08, stdev: 0.15, p5: 0.85, p50: 1.07, p95: 1.35, probabilityOfLoss: 0.12 },
  },
  conventional: {
    percentilesByDay: [{ day: 0, p5: 1, p25: 1, p50: 1, p75: 1, p95: 1 }],
    finalValue: { mean: 1.06, stdev: 0.18, p5: 0.78, p50: 1.04, p95: 1.4, probabilityOfLoss: 0.18 },
  },
  computedAt: "2026-07-30T12:00:00.000Z",
};

describe("GET /api/monte-carlo", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns the cached comparison when available", async () => {
    app = await buildApp({ logger: false, getPortfolioComparison: () => cache });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/monte-carlo" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(cache);
  });

  it("returns 503, not a crash, when no injection is provided", async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/monte-carlo" });

    expect(res.statusCode).toBe(503);
  });

  it("returns 503 when the injection returns null (cache not warm yet)", async () => {
    app = await buildApp({ logger: false, getPortfolioComparison: () => null });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/monte-carlo" });

    expect(res.statusCode).toBe(503);
  });
});
