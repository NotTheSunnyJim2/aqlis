import { annualizeCovarianceMatrix, computeCovarianceMatrix } from "./covariance.js";
import { simulatePortfolio, summarizePaths, type PathSummary } from "./monte-carlo.js";
import { computeAnnualizedStats, computeLogReturns } from "./returns.js";

export interface AssetHistory {
  symbol: string;
  /** Oldest-first daily closes, ALIGNED to the same trading calendar as
   * every other asset's history passed alongside it. */
  closes: number[];
}

export interface PortfolioComparisonInputs {
  /** Watchlist symbols currently passing the screening engine (Phase 9)
   * — the "halal portfolio." */
  halalSymbols: string[];
  /** The full watchlist, unrestricted — the "conventional portfolio." */
  conventionalSymbols: string[];
  /** One entry per symbol across the UNION of both portfolios. */
  histories: AssetHistory[];
  horizonDays: number;
  numSimulations: number;
  randomFn?: () => number;
}

export interface PortfolioComparisonResult {
  halal: PathSummary;
  conventional: PathSummary;
}

/**
 * Runs the halal and conventional portfolio simulations from one shared
 * pool of historical data (fetched once for the union of both symbol
 * lists — halal is normally a subset of conventional, so this avoids
 * fetching the same history twice for the overlapping symbols).
 */
export function buildPortfolioComparison(
  inputs: PortfolioComparisonInputs,
): PortfolioComparisonResult {
  const { histories, horizonDays, numSimulations, randomFn } = inputs;

  const lengths = new Set(histories.map((h) => h.closes.length));
  if (lengths.size > 1) {
    throw new Error(
      `Historical price series have mismatched lengths (${[...lengths].join(", ")}) — ` +
        `cannot compute an aligned covariance matrix across assets with different date ranges`,
    );
  }

  const bySymbol = new Map(histories.map((h) => [h.symbol, h]));

  return {
    halal: simulateOnePortfolio(inputs.halalSymbols, bySymbol, horizonDays, numSimulations, randomFn),
    conventional: simulateOnePortfolio(
      inputs.conventionalSymbols,
      bySymbol,
      horizonDays,
      numSimulations,
      randomFn,
    ),
  };
}

function simulateOnePortfolio(
  symbols: string[],
  bySymbol: Map<string, AssetHistory>,
  horizonDays: number,
  numSimulations: number,
  randomFn: (() => number) | undefined,
): PathSummary {
  const histories = symbols.map((symbol) => {
    const history = bySymbol.get(symbol);
    if (!history) {
      throw new Error(`No historical data available for ${symbol}`);
    }
    return history;
  });

  const returnSeries = histories.map((h) => computeLogReturns(h.closes));
  const mu = returnSeries.map((series) => computeAnnualizedStats(series).mu);
  const covMatrix = annualizeCovarianceMatrix(computeCovarianceMatrix(returnSeries));
  // Equal-weighted by dollar allocation — the simplest defensible
  // baseline; a market-cap-weighted alternative was considered and
  // rejected for v1 (would need live market caps at simulation time,
  // real complexity for a stretch-goal feature).
  const weights = symbols.map(() => 1 / symbols.length);

  const { paths } = simulatePortfolio({
    mu,
    covMatrix,
    weights,
    horizonDays,
    numSimulations,
    randomFn,
  });

  return summarizePaths(paths);
}
