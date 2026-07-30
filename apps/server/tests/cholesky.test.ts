import { describe, expect, it } from "vitest";
import { choleskyDecompose, multiplyMatrixVector } from "../src/analytics/cholesky.js";

describe("choleskyDecompose", () => {
  it("factors a known 2x2 covariance matrix correctly (hand-verifiable)", () => {
    // Sigma = [[4, 2], [2, 5]] (symmetric, positive-definite).
    // L[0][0] = sqrt(4) = 2
    // L[1][0] = 2 / 2 = 1
    // L[1][1] = sqrt(5 - 1^2) = sqrt(4) = 2
    const L = choleskyDecompose([
      [4, 2],
      [2, 5],
    ]);

    expect(L[0]![0]).toBeCloseTo(2, 10);
    expect(L[0]![1]).toBe(0); // upper triangle is zero
    expect(L[1]![0]).toBeCloseTo(1, 10);
    expect(L[1]![1]).toBeCloseTo(2, 10);
  });

  it("reconstructs the original matrix via L * L^T", () => {
    const matrix = [
      [6, 1, 2],
      [1, 5, 3],
      [2, 3, 7],
    ];
    const L = choleskyDecompose(matrix);

    // (L * L^T)[i][j] = sum_k L[i][k] * L[j][k]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) sum += L[i]![k]! * L[j]![k]!;
        expect(sum).toBeCloseTo(matrix[i]![j]!, 8);
      }
    }
  });

  it("throws a clear error for a non-positive-semi-definite matrix", () => {
    // A matrix that isn't a valid covariance matrix (negative diagonal
    // reachable after subtracting the running sum).
    expect(() => choleskyDecompose([[1, 2], [2, 1]])).toThrow(/not positive-semi-definite/);
  });

  it("throws a clear error for a singular matrix (perfectly correlated assets)", () => {
    // Assets 0 and 1 are perfectly correlated (variance 4, covariance 4
    // -> correlation 1), which zeroes L[1][1] — that alone doesn't
    // throw (a trailing zero diagonal is valid), but asset 2 needs to
    // divide by that zero pivot when computing L[2][1], which does.
    expect(() =>
      choleskyDecompose([
        [4, 4, 2],
        [4, 4, 2],
        [2, 2, 5],
      ]),
    ).toThrow(/singular matrix/);
  });
});

describe("multiplyMatrixVector", () => {
  it("computes a standard matrix-vector product", () => {
    const result = multiplyMatrixVector(
      [
        [1, 2],
        [3, 4],
      ],
      [5, 6],
    );
    expect(result).toEqual([1 * 5 + 2 * 6, 3 * 5 + 4 * 6]);
  });
});
