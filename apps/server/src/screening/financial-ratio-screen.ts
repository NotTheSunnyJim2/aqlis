/**
 * Financial ratio screen.
 *
 * Source: S&P Dow Jones Islamic Market Indices Methodology, S&P Dow
 * Jones Indices LLC (current edition, Feb 2026):
 * https://www.spglobal.com/spdji/en/documents/methodologies/methodology-dj-islamic-market-indices.pdf
 *
 * Three ratios, each capped at 33% of market capitalization: total
 * debt; cash + interest-bearing securities; accounts receivable.
 *
 * DEVIATION FROM THE SOURCE (approved, see ADR-002): the published
 * methodology uses a 24-month TRAILING AVERAGE market cap to reduce
 * index turnover. This project deliberately uses SPOT market cap
 * (live price × diluted shares) instead — the entire point of Aqlis
 * is to make live compliance drift visible, which a smoothed average
 * would hide almost completely.
 *
 * Every input is nullable (see FundamentalsSnapshot / "missing != zero"
 * throughout this codebase): a missing figure produces ratio = null,
 * never a silently-wrong 0.
 */

const RATIO_THRESHOLD = 0.33;

export interface RatioScreenInput {
  /** Latest known price × diluted shares outstanding. */
  marketCap: number | null;
  totalDebt: number | null;
  cashAndShortTermInvestments: number | null;
  netReceivables: number | null;
}

export interface RatioResult {
  /** null when an input was missing — "unknown", never a false pass/fail. */
  ratio: number | null;
  pass: boolean | null;
}

export interface RatioScreenResult {
  debt: RatioResult;
  cash: RatioResult;
  receivables: RatioResult;
}

function computeRatio(numerator: number | null, marketCap: number | null): RatioResult {
  if (numerator === null || marketCap === null || marketCap <= 0) {
    return { ratio: null, pass: null };
  }
  const ratio = numerator / marketCap;
  return { ratio, pass: ratio < RATIO_THRESHOLD };
}

/** Spot market cap = latest price x diluted shares outstanding. */
export function computeMarketCap(price: number | null, sharesOutstanding: number | null): number | null {
  if (price === null || sharesOutstanding === null) {
    return null;
  }
  return price * sharesOutstanding;
}

export function screenFinancialRatios(input: RatioScreenInput): RatioScreenResult {
  return {
    debt: computeRatio(input.totalDebt, input.marketCap),
    cash: computeRatio(input.cashAndShortTermInvestments, input.marketCap),
    receivables: computeRatio(input.netReceivables, input.marketCap),
  };
}
