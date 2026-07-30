const TRADING_DAYS_PER_YEAR = 252;

/**
 * Sample covariance matrix from ALIGNED daily log-return series — index
 * `d` of every series must be the same trading day, or the off-diagonal
 * (co-movement) terms are meaningless. The diagonal is each asset's own
 * variance; identical to squaring `computeAnnualizedStats`'s daily
 * sigma, computed once here since it's needed alongside the off-diagonal
 * terms anyway.
 */
export function computeCovarianceMatrix(returnSeries: number[][]): number[][] {
  const n = returnSeries.length;
  const t = returnSeries[0]!.length;
  const means = returnSeries.map((series) => series.reduce((sum, r) => sum + r, 0) / t);

  const cov: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let d = 0; d < t; d++) {
        sum += (returnSeries[i]![d]! - means[i]!) * (returnSeries[j]![d]! - means[j]!);
      }
      cov[i]![j] = sum / (t - 1);
    }
  }
  return cov;
}

/** Same scaling rule as computeAnnualizedStats's sigma, applied to a
 * whole matrix at once — covariance is a variance-like quantity, so it
 * scales linearly with time (not sqrt(time), that's for standard
 * deviation specifically). */
export function annualizeCovarianceMatrix(dailyCov: number[][]): number[][] {
  return dailyCov.map((row) => row.map((v) => v * TRADING_DAYS_PER_YEAR));
}
