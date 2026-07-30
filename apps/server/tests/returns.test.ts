import { describe, expect, it } from "vitest";
import { computeAnnualizedStats, computeLogReturns } from "../src/analytics/returns.js";

describe("computeLogReturns", () => {
  it("returns one fewer value than the price series", () => {
    expect(computeLogReturns([100, 110, 105, 120])).toHaveLength(3);
  });

  it("returns all zeros for a constant price series", () => {
    expect(computeLogReturns([100, 100, 100])).toEqual([0, 0]);
  });

  it("matches ln(price_t / price_t-1) exactly", () => {
    const [r1, r2] = computeLogReturns([100, 110, 99]);
    expect(r1).toBeCloseTo(Math.log(110 / 100), 10);
    expect(r2).toBeCloseTo(Math.log(99 / 110), 10);
  });
});

describe("computeAnnualizedStats", () => {
  it("returns mu=0, sigma=0 for a constant (zero-variance) series", () => {
    const stats = computeAnnualizedStats([0, 0, 0, 0, 0]);
    expect(stats.mu).toBe(0);
    expect(stats.sigma).toBe(0);
  });

  it("annualizes drift linearly and volatility by sqrt(time)", () => {
    // Symmetric returns [x, -x]: mean is exactly 0, sample variance
    // (n-1 denominator) is ((x-0)^2 + (-x-0)^2) / (2-1) = 2x^2.
    const x = 0.05;
    const stats = computeAnnualizedStats([x, -x]);
    const expectedDailySigma = Math.sqrt(2 * x * x);

    expect(stats.mu).toBe(0);
    expect(stats.sigma).toBeCloseTo(expectedDailySigma * Math.sqrt(252), 10);
  });
});
