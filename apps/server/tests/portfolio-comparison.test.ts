import { describe, expect, it } from "vitest";
import { buildPortfolioComparison } from "../src/analytics/portfolio-comparison.js";

/** A deterministic, non-degenerate oscillating price series — distinct
 * phase per symbol keeps the resulting covariance matrix well-
 * conditioned (a truly flat/constant series has zero variance, which
 * makes the covariance matrix singular — see cholesky.ts). */
function wavyHistory(symbol: string, days: number, phase: number): { symbol: string; closes: number[] } {
  return {
    symbol,
    closes: Array.from({ length: days }, (_, i) => 100 + 5 * Math.sin(i * 0.3 + phase)),
  };
}

describe("buildPortfolioComparison", () => {
  it("simulates both portfolios and returns a PathSummary for each", () => {
    const result = buildPortfolioComparison({
      halalSymbols: ["AAPL", "MSFT"],
      conventionalSymbols: ["AAPL", "MSFT", "JPM", "MGM"],
      histories: [
        wavyHistory("AAPL", 100, 0),
        wavyHistory("MSFT", 100, 0.5),
        wavyHistory("JPM", 100, 1.2),
        wavyHistory("MGM", 100, 2.1),
      ],
      horizonDays: 10,
      numSimulations: 5,
    });

    expect(result.halal.percentilesByDay).toHaveLength(11);
    expect(result.conventional.percentilesByDay).toHaveLength(11);
    // Every simulated path starts at portfolio value 1.0 by construction.
    expect(result.halal.percentilesByDay[0]!.p50).toBeCloseTo(1, 10);
    expect(result.conventional.percentilesByDay[0]!.p50).toBeCloseTo(1, 10);
  });

  it("throws a clear error when a portfolio references a symbol with no fetched history", () => {
    expect(() =>
      buildPortfolioComparison({
        halalSymbols: ["AAPL", "NOPE"],
        conventionalSymbols: ["AAPL"],
        histories: [wavyHistory("AAPL", 50, 0)],
        horizonDays: 5,
        numSimulations: 2,
      }),
    ).toThrow(/No historical data available for NOPE/);
  });

  it("throws a clear error when histories have mismatched lengths", () => {
    expect(() =>
      buildPortfolioComparison({
        halalSymbols: ["AAPL"],
        conventionalSymbols: ["AAPL", "MSFT"],
        histories: [wavyHistory("AAPL", 100, 0), wavyHistory("MSFT", 99, 0.5)],
        horizonDays: 5,
        numSimulations: 2,
      }),
    ).toThrow(/mismatched lengths/);
  });
});
