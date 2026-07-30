import { describe, expect, it } from "vitest";
import { annualizeCovarianceMatrix, computeCovarianceMatrix } from "../src/analytics/covariance.js";

describe("computeCovarianceMatrix", () => {
  it("puts each asset's own variance on the diagonal", () => {
    // Asset A: [0.1, -0.1] -> mean 0, sample variance = (0.01+0.01)/1 = 0.02
    // Asset B: constant [0.05, 0.05] -> zero variance
    const cov = computeCovarianceMatrix([
      [0.1, -0.1],
      [0.05, 0.05],
    ]);

    expect(cov[0]![0]).toBeCloseTo(0.02, 10);
    expect(cov[1]![1]).toBe(0);
  });

  it("computes negative covariance for perfectly anti-correlated assets", () => {
    // A moves +0.1/-0.1, B moves the exact opposite -0.1/+0.1.
    const cov = computeCovarianceMatrix([
      [0.1, -0.1],
      [-0.1, 0.1],
    ]);

    // cov(A,B) = ((0.1-0)(-0.1-0) + (-0.1-0)(0.1-0)) / 1 = (-0.01-0.01)/1 = -0.02
    expect(cov[0]![1]).toBeCloseTo(-0.02, 10);
    expect(cov[1]![0]).toBeCloseTo(-0.02, 10); // symmetric
  });

  it("computes positive covariance for perfectly correlated assets", () => {
    const cov = computeCovarianceMatrix([
      [0.1, -0.1],
      [0.1, -0.1],
    ]);

    expect(cov[0]![1]).toBeCloseTo(0.02, 10);
  });
});

describe("annualizeCovarianceMatrix", () => {
  it("scales every entry linearly by 252 trading days", () => {
    const annualized = annualizeCovarianceMatrix([
      [0.0001, 0.00005],
      [0.00005, 0.0002],
    ]);

    expect(annualized[0]![0]).toBeCloseTo(0.0001 * 252, 10);
    expect(annualized[0]![1]).toBeCloseTo(0.00005 * 252, 10);
    expect(annualized[1]![1]).toBeCloseTo(0.0002 * 252, 10);
  });
});
