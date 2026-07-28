import { z } from "zod";

/** A normalized fundamentals snapshot merged from two FMP statements. */
export interface ParsedFundamentals {
  symbol: string;
  periodEndDate: Date;
  period: string;
  fiscalYear: string;
  acceptedAt: Date;
  reportedCurrency: string;
  // Balance-sheet inputs (missing -> null, never 0; see "missing != zero").
  totalDebt: number | null;
  cashAndShortTermInvestments: number | null;
  netReceivables: number | null;
  totalAssets: number | null;
  // Income-statement inputs.
  revenue: number | null;
  interestIncome: number | null;
  sharesOutstanding: number | null;
}

// A monetary field: a number when present, otherwise null/absent.
const money = z.number().nullish();

// Only the fields we consume; zod ignores FMP's many other columns.
const balanceSheetSchema = z.object({
  date: z.string(),
  symbol: z.string(),
  period: z.string(),
  fiscalYear: z.string(),
  acceptedDate: z.string(),
  reportedCurrency: z.string(),
  totalDebt: money,
  cashAndShortTermInvestments: money,
  netReceivables: money,
  totalAssets: money,
});

const incomeStatementSchema = z.object({
  revenue: money,
  interestIncome: money,
  weightedAverageShsOutDil: money,
});

/** Validate an FMP array response and return its first statement, or null. */
function firstStatement<T>(payload: unknown, schema: z.ZodType<T>): T | null {
  const asArray = z.array(z.unknown()).safeParse(payload);
  if (!asArray.success || asArray.data.length === 0) {
    return null;
  }
  const parsed = schema.safeParse(asArray.data[0]);
  return parsed.success ? parsed.data : null;
}

/**
 * Merge FMP balance-sheet and income-statement responses into one
 * normalized snapshot.
 *
 * The balance sheet is authoritative for identity (symbol/period/dates)
 * and the debt figure, so if it can't be parsed we return null — the
 * fetch is unusable and the caller should retry. The income statement
 * is best-effort: if it's missing, revenue/interest/shares are null and
 * the screen will simply report those ratios as indeterminate.
 */
export function parseFundamentals(
  balanceSheetPayload: unknown,
  incomeStatementPayload: unknown,
): ParsedFundamentals | null {
  const bs = firstStatement(balanceSheetPayload, balanceSheetSchema);
  if (!bs) {
    return null;
  }

  const periodEndDate = new Date(bs.date);
  // FMP accepted dates look like "2026-05-01 10:01:00"; make them ISO.
  const acceptedAt = new Date(bs.acceptedDate.replace(" ", "T"));
  if (Number.isNaN(periodEndDate.getTime()) || Number.isNaN(acceptedAt.getTime())) {
    return null;
  }

  const is = firstStatement(incomeStatementPayload, incomeStatementSchema);

  return {
    symbol: bs.symbol,
    periodEndDate,
    period: bs.period,
    fiscalYear: bs.fiscalYear,
    acceptedAt,
    reportedCurrency: bs.reportedCurrency,
    totalDebt: bs.totalDebt ?? null,
    cashAndShortTermInvestments: bs.cashAndShortTermInvestments ?? null,
    netReceivables: bs.netReceivables ?? null,
    totalAssets: bs.totalAssets ?? null,
    revenue: is?.revenue ?? null,
    interestIncome: is?.interestIncome ?? null,
    sharesOutstanding: is?.weightedAverageShsOutDil ?? null,
  };
}
