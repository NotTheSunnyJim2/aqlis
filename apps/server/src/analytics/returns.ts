const TRADING_DAYS_PER_YEAR = 252;

/**
 * Daily log returns from a series of prices. Log returns (not simple
 * percentage returns) are what GBM is defined in terms of — they're
 * additive across time (today's + tomorrow's log return = the 2-day log
 * return, unlike simple returns) and symmetric (a 10% up day and a 10%
 * down day are NOT equal-and-opposite in simple-return terms, but they
 * are in log-return terms), both of which the simulation math below
 * depends on.
 *
 * `prices` MUST be oldest-to-newest — FMP's historical endpoint returns
 * newest-first, so callers fetching from it must reverse before this.
 */
export function computeLogReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i]! / prices[i - 1]!));
  }
  return returns;
}

export interface AnnualizedStats {
  /** Annualized drift (mu) — GBM's expected-return parameter. */
  mu: number;
  /** Annualized volatility (sigma) — GBM's risk parameter. */
  sigma: number;
}

/**
 * Annualizes daily log-return statistics. Drift scales linearly with
 * time (252 trading days of average daily return); volatility scales
 * with the SQUARE ROOT of time — a well-known result of variance being
 * additive across independent periods while standard deviation is not
 * (Var(X+Y) = Var(X)+Var(Y) for independent X,Y, so stdev scales by
 * sqrt(n) not n).
 */
export function computeAnnualizedStats(logReturns: number[]): AnnualizedStats {
  const n = logReturns.length;
  const mean = logReturns.reduce((sum, r) => sum + r, 0) / n;
  // Sample variance (n-1 denominator, Bessel's correction) — these are
  // returns ESTIMATED from a finite historical sample, not the true
  // population parameters.
  const variance = logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  const dailySigma = Math.sqrt(variance);

  return {
    mu: mean * TRADING_DAYS_PER_YEAR,
    sigma: dailySigma * Math.sqrt(TRADING_DAYS_PER_YEAR),
  };
}
