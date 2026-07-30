/**
 * Lower-triangular Cholesky factor L such that L · Lᵀ = matrix
 * (Cholesky–Banachiewicz algorithm). Every real covariance matrix is
 * symmetric positive-semi-definite, so this always succeeds on a valid
 * one — the two error cases below both mean the input wasn't actually
 * valid, not that the algorithm failed.
 *
 * WHY this exists: correlated random shocks for the simulation are
 * generated as `L · z` where z is a vector of INDEPENDENT standard
 * normals — the resulting vector has exactly the covariance structure
 * of `matrix`. This is the standard technique for turning independent
 * randomness into correlated randomness; Cholesky is the cheapest
 * factorization that does it (compare eigendecomposition, which also
 * works but costs more to compute).
 */
export function choleskyDecompose(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i]![k]! * L[j]![k]!;
      }

      if (i === j) {
        const diag = matrix[i]![i]! - sum;
        if (diag < 0) {
          throw new Error(
            `Cholesky decomposition failed: matrix is not positive-semi-definite ` +
              `(negative diagonal at row ${i}) — this means the input wasn't a valid ` +
              `covariance matrix, e.g. too few historical observations for the number of assets`,
          );
        }
        L[i]![j] = Math.sqrt(diag);
      } else {
        const pivot = L[j]![j]!;
        if (pivot === 0) {
          throw new Error(
            `Cholesky decomposition failed: singular matrix (zero pivot at row ${j}) — ` +
              `this means two assets had perfectly correlated (or constant) historical returns`,
          );
        }
        L[i]![j] = (matrix[i]![j]! - sum) / pivot;
      }
    }
  }

  return L;
}

/** L · z — turns independent draws in `vector` into ones correlated per
 * the covariance matrix `L` was factored from. */
export function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, i) => sum + value * vector[i]!, 0));
}
