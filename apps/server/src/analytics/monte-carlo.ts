import { choleskyDecompose, multiplyMatrixVector } from "./cholesky.js";
import { randomNormal } from "./random-normal.js";

const TRADING_DAYS_PER_YEAR = 252;

export interface MonteCarloInputs {
  /** Per-asset annualized drift (mu), same order as covMatrix's rows. */
  mu: number[];
  /** Annualized covariance matrix — diagonal is each asset's own
   * variance, off-diagonal is co-movement. */
  covMatrix: number[][];
  /** Dollar-allocation weights, same order as mu/covMatrix, sum to 1. */
  weights: number[];
  /** Trading days to simulate forward. */
  horizonDays: number;
  numSimulations: number;
  /** Injectable for deterministic tests — same DI pattern as every
   * other randomness/I/O boundary in this codebase. */
  randomFn?: () => number;
}

export interface SimulationResult {
  /** paths[sim][day] = portfolio value (starting at 1.0 = 100%) on that
   * day of that simulated path. */
  paths: number[][];
}

/**
 * Simulates `numSimulations` correlated GBM paths for a weighted
 * portfolio, starting at value 1.0 (100%) and evolving as the
 * weighted sum of each asset's own cumulative return factor —
 * `price(t)/price(0)` per asset, not raw prices, which sidesteps ever
 * needing share counts (AAPL at ~$330 and T at ~$20 both just
 * contribute their OWN return, weighted by dollar allocation).
 *
 * Correlation comes from `L · z`: z is a vector of independent
 * standard normals (one per asset per day), and L is covMatrix's
 * Cholesky factor — the resulting vector has exactly covMatrix's
 * covariance structure (see cholesky.ts for why this works).
 */
export function simulatePortfolio(inputs: MonteCarloInputs): SimulationResult {
  const { mu, covMatrix, weights, horizonDays, numSimulations } = inputs;
  const randomFn = inputs.randomFn ?? Math.random;
  const n = mu.length;
  const dt = 1 / TRADING_DAYS_PER_YEAR;
  const L = choleskyDecompose(covMatrix);

  const paths: number[][] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    // Cumulative return factor per asset, starts at 1.0 (today's price).
    const returnFactors = new Array<number>(n).fill(1);
    const portfolioPath: number[] = [1];

    for (let day = 0; day < horizonDays; day++) {
      const independentShocks = Array.from({ length: n }, () => randomNormal(randomFn));
      const correlatedShocks = multiplyMatrixVector(L, independentShocks);

      for (let i = 0; i < n; i++) {
        // GBM step: drift - 0.5*sigma^2 corrects for log-normal vs
        // arithmetic mean (Jensen's inequality) — see returns.ts.
        const drift = (mu[i]! - 0.5 * covMatrix[i]![i]!) * dt;
        const diffusion = correlatedShocks[i]! * Math.sqrt(dt);
        returnFactors[i]! *= Math.exp(drift + diffusion);
      }

      const portfolioValue = weights.reduce((sum, w, i) => sum + w * returnFactors[i]!, 0);
      portfolioPath.push(portfolioValue);
    }

    paths.push(portfolioPath);
  }

  return { paths };
}

export interface PathSummary {
  percentilesByDay: Array<{ day: number; p5: number; p25: number; p50: number; p75: number; p95: number }>;
  finalValue: {
    mean: number;
    stdev: number;
    p5: number;
    p50: number;
    p95: number;
    /** Fraction of simulated paths that ended below 1.0 (a net loss). */
    probabilityOfLoss: number;
  };
}

/**
 * Reduces raw simulation paths (numSimulations x horizonDays floats —
 * far too much to return over HTTP) to percentile bands per day and
 * summary statistics of the final-day distribution. This is the shape
 * the API and frontend actually consume.
 */
export function summarizePaths(paths: number[][]): PathSummary {
  const numSimulations = paths.length;
  const horizonDays = paths[0]!.length;

  const percentilesByDay = [];
  for (let day = 0; day < horizonDays; day++) {
    const valuesOnDay = paths.map((path) => path[day]!).sort((a, b) => a - b);
    percentilesByDay.push({
      day,
      p5: percentile(valuesOnDay, 5),
      p25: percentile(valuesOnDay, 25),
      p50: percentile(valuesOnDay, 50),
      p75: percentile(valuesOnDay, 75),
      p95: percentile(valuesOnDay, 95),
    });
  }

  const finalValues = paths.map((path) => path[path.length - 1]!).sort((a, b) => a - b);
  const mean = finalValues.reduce((sum, v) => sum + v, 0) / numSimulations;
  const variance = finalValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (numSimulations - 1);

  return {
    percentilesByDay,
    finalValue: {
      mean,
      stdev: Math.sqrt(variance),
      p5: percentile(finalValues, 5),
      p50: percentile(finalValues, 50),
      p95: percentile(finalValues, 95),
      probabilityOfLoss: finalValues.filter((v) => v < 1).length / numSimulations,
    },
  };
}

/** Linear-interpolation percentile of an ALREADY-SORTED array. */
function percentile(sortedValues: number[], p: number): number {
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower]!;
  const weight = index - lower;
  return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight;
}
