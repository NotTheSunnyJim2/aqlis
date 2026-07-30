# ADR 005 — Monte Carlo halal vs conventional portfolio comparison

Date: 2026-07-30
Status: Accepted

## Context

Phase 20 (an explicitly optional stretch goal) asks: given the live
screening engine's compliant/non-compliant split of the watchlist, how
would a portfolio restricted to compliant stocks actually perform against
an unrestricted one? A single historical backtest answers that for one
realized path; a Monte Carlo simulation answers it for the full
distribution of plausible future outcomes, which is the more honest way
to compare risk, not just return.

## Decision

**Model**: correlated Geometric Brownian Motion (GBM), one path per
simulated trading day, using each stock's own annualized drift (μ) and
volatility (σ) estimated from **5 years of real daily closes fetched
live from FMP's `historical-price-eod` endpoint** — confirmed available
on the free tier with no new signup (same API key already used for
fundamentals). Real data, not hardcoded assumptions or a synthetic
distribution.

**Correlation**: a real covariance matrix from the same historical
returns, applied via Cholesky decomposition (`L · z`, z independent
standard normals) rather than simulating each stock as an independent
random walk — real stocks in the same market genuinely co-move, and
ignoring that overstates a portfolio's diversification benefit.

**Portfolio definition**: halal = equal-weighted basket of whichever
watchlist symbols currently pass the live screening engine (Phase 9);
conventional = the full watchlist, unrestricted. Live-verdict-based, not
a fixed snapshot — if a stock's compliance status drifts, the halal
portfolio's composition drifts with it on the next scheduled refresh.

**Execution**: recomputed on a 12-hour background timer inside the API
process, never inside a request handler. `GET /api/monte-carlo` only
ever reads whatever's cached — see "event-loop blocking" below for why.

## Alternatives considered

- **Independent (uncorrelated) simulation per stock** — much simpler,
  but systematically overstates diversification; rejected in favor of
  the real covariance matrix (see also ADR-004's "same infrastructure,
  matched to the actual guarantee needed" pattern — here it's "same
  simulation technique, matched to the actual correlation that exists").
- **Historical bootstrap resampling** (resample real historical daily
  return SEQUENCES rather than fit a GBM distribution) — arguably more
  realistic (captures real fat tails, real historical crash days) but
  doesn't generalize beyond the exact historical period sampled from,
  and GBM is the more widely-taught, more defensible-in-an-interview
  baseline technique. Worth a future iteration, not v1.
- **Market-cap-weighted portfolios** instead of equal-weighted — more
  realistic to how index funds actually work, but needs live market
  caps fed into the weighting at simulation time, real added complexity
  for a stretch-goal feature; equal-weighting is the standard simplest
  defensible baseline.
- **Compute inline in the request handler** — simplest code, but
  measured at ~500ms combined (both portfolios, 1000 simulations each)
  of synchronous CPU-bound work, which blocks Node's single event loop
  and stalls every concurrent request AND the WebSocket heartbeat sweep
  for that entire window. Rejected once actually measured, not assumed
  fast enough.
- **Worker threads** (`node:worker_threads`) to run the simulation off
  the main thread — the fully "correct" production fix for CPU-bound
  work in Node, and a stronger interview story than a timer. Rejected
  for v1 as more implementation weight than a stretch-goal feature
  warrants; the background-timer approach achieves the same practical
  outcome (no request ever pays the compute cost) with far less code,
  at the cost of a periodic ~500ms stall on whoever's connected exactly
  when the timer fires once every 12 hours — an acceptable trade at this
  project's actual traffic level.

## Consequences

- Easier: `GET /api/monte-carlo` is always fast (cache read only);
  FMP's free-tier quota is barely touched (10 requests per 12h refresh,
  vs the 250/day cap already budgeted for fundamentals polling).
- Harder: results are only as fresh as the last refresh (up to 12h
  stale) and the cache is empty (503) for a short window right after
  process startup, before the first background refresh completes.
- A genuinely interesting, real result (not fabricated for the demo):
  simulated from real 2021–2026 data, the halal portfolio (AAPL, MSFT,
  NVDA, TSLA, XOM, JNJ) shows HIGHER expected return and volatility than
  the conventional one, but a LOWER probability of loss — an artifact of
  which specific stocks happen to be excluded (JPM/BAC/MGM/T) and how
  their correlation structure interacts with the rest, not a general
  claim about halal investing. Stated explicitly to avoid overclaiming
  from a 10-stock, single-watchlist sample.

## References

- Hull, *Options, Futures, and Other Derivatives* — standard GBM/Monte
  Carlo treatment (the model implemented in `analytics/monte-carlo.ts`)
- FMP historical price endpoint: https://site.financialmodelingprep.com/developer/docs#historical-price-eod
- Node.js worker threads (considered, not used):
  https://nodejs.org/api/worker_threads.html
