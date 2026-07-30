import { describe, expect, it } from "vitest";
import { simulatePortfolio, summarizePaths } from "../src/analytics/monte-carlo.js";

describe("simulatePortfolio", () => {
  it("produces a fully deterministic path when volatility is zero, regardless of the random source", () => {
    // Zero variance -> Cholesky factor is all zeros -> no randomness
    // enters the simulation at all, so growth is pure compounding.
    const result = simulatePortfolio({
      mu: [0.1], // 10% annualized drift
      covMatrix: [[0]],
      weights: [1],
      horizonDays: 252, // exactly 1 year
      numSimulations: 3,
      randomFn: () => 0.999999, // arbitrary — should have zero effect
    });

    const finalValues = result.paths.map((p) => p[p.length - 1]!);
    // Continuously-compounded growth by mu over exactly 1 year.
    const expected = Math.exp(0.1);
    for (const value of finalValues) {
      expect(value).toBeCloseTo(expected, 6);
    }
    // All 3 simulations identical — no randomness varied the outcome.
    expect(new Set(finalValues.map((v) => v.toFixed(10))).size).toBe(1);
  });

  it("every path starts at portfolio value 1.0", () => {
    const result = simulatePortfolio({
      mu: [0.05, 0.08],
      covMatrix: [
        [0.04, 0.01],
        [0.01, 0.09],
      ],
      weights: [0.5, 0.5],
      horizonDays: 10,
      numSimulations: 5,
    });

    for (const path of result.paths) {
      expect(path[0]).toBe(1);
      expect(path).toHaveLength(11); // day 0 (start) + 10 simulated days
    }
  });

  it("correlation structure actually affects the simulated paths, not just the inputs", () => {
    const sharedInputs = {
      mu: [0, 0],
      weights: [0.5, 0.5],
      horizonDays: 20,
      numSimulations: 1,
    };
    let calls = 0;
    const fixedSequence = [0.3, 0.7, 0.2, 0.9, 0.4, 0.6, 0.1, 0.8, 0.5, 0.55];
    const randomFn = () => fixedSequence[calls++ % fixedSequence.length]!;

    const independent = simulatePortfolio({
      ...sharedInputs,
      covMatrix: [
        [0.04, 0],
        [0, 0.04],
      ],
      randomFn,
    });

    calls = 0; // replay the exact same random sequence
    const correlated = simulatePortfolio({
      ...sharedInputs,
      covMatrix: [
        [0.04, 0.038],
        [0.038, 0.04],
      ],
      randomFn,
    });

    // Same random draws, same marginal variances, different covariance
    // structure -> different portfolio outcome. If this failed, the
    // Cholesky factor wouldn't actually be influencing the simulation.
    const independentFinal = independent.paths[0]![independent.paths[0]!.length - 1]!;
    const correlatedFinal = correlated.paths[0]![correlated.paths[0]!.length - 1]!;
    expect(independentFinal).not.toBeCloseTo(correlatedFinal, 6);
  });
});

describe("summarizePaths", () => {
  it("reports zero stdev and exact percentiles when every path is identical", () => {
    const paths = [
      [1, 1.02, 1.05],
      [1, 1.02, 1.05],
      [1, 1.02, 1.05],
    ];
    const summary = summarizePaths(paths);

    expect(summary.finalValue.mean).toBeCloseTo(1.05, 10);
    expect(summary.finalValue.stdev).toBe(0);
    expect(summary.finalValue.p50).toBeCloseTo(1.05, 10);
    expect(summary.finalValue.probabilityOfLoss).toBe(0);
  });

  it("computes probabilityOfLoss as the fraction of paths ending strictly below 1.0", () => {
    const paths = [[1, 0.9], [1, 1.0], [1, 1.1], [1, 0.5]];
    const summary = summarizePaths(paths);

    expect(summary.finalValue.probabilityOfLoss).toBeCloseTo(2 / 4, 10); // 0.9 and 0.5
  });

  it("interpolates percentiles linearly (5 sorted final values 1..5)", () => {
    const paths = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]];
    const summary = summarizePaths(paths);

    expect(summary.finalValue.p50).toBeCloseTo(3, 10);
    expect(summary.finalValue.p5).toBeCloseTo(1.2, 10); // index 0.2 between 1 and 2
    expect(summary.finalValue.p95).toBeCloseTo(4.8, 10); // index 3.8 between 4 and 5
  });

  it("produces one percentile entry per simulated day, including day 0", () => {
    const paths = [[1, 1.01, 1.02], [1, 0.99, 1.03]];
    const summary = summarizePaths(paths);
    expect(summary.percentilesByDay).toHaveLength(3);
    expect(summary.percentilesByDay[0]!.day).toBe(0);
    expect(summary.percentilesByDay[2]!.day).toBe(2);
  });
});
