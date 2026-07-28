import { fieldsToRecord } from "./stream-entry.js";

export interface FundamentalsStreamEntry {
  symbol: string;
  periodEndDate: Date;
  period: string;
  fiscalYear: string;
  acceptedAt: Date;
  reportedCurrency: string;
  // Nullable financials, kept as strings for the same precision reason
  // as PriceStreamEntry.price — null decodes the "null" sentinel the
  // publisher wrote (see fundamentals-publisher.ts: a stream field
  // can't literally be absent, so absence is an explicit string).
  totalDebt: string | null;
  cashAndShortTermInvestments: string | null;
  netReceivables: string | null;
  totalAssets: string | null;
  revenue: string | null;
  interestIncome: string | null;
  sharesOutstanding: string | null;
}

function decodeNullable(raw: string | undefined): string | null {
  return raw === undefined || raw === "null" ? null : raw;
}

function decodeEpochMs(raw: string | undefined): Date | null {
  if (raw === undefined) {
    return null;
  }
  const ms = Number(raw);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** Parses one fundamentals:stream entry. Returns null for a malformed
 * entry — same "leave it pending, don't crash the loop" contract as
 * parsePriceEntry. */
export function parseFundamentalsEntry(fields: string[]): FundamentalsStreamEntry | null {
  const r = fieldsToRecord(fields);
  const periodEndDate = decodeEpochMs(r.periodEndDate);
  const acceptedAt = decodeEpochMs(r.acceptedAt);

  if (
    !r.symbol ||
    !r.period ||
    !r.fiscalYear ||
    !r.reportedCurrency ||
    !periodEndDate ||
    !acceptedAt
  ) {
    return null;
  }

  return {
    symbol: r.symbol,
    periodEndDate,
    period: r.period,
    fiscalYear: r.fiscalYear,
    acceptedAt,
    reportedCurrency: r.reportedCurrency,
    totalDebt: decodeNullable(r.totalDebt),
    cashAndShortTermInvestments: decodeNullable(r.cashAndShortTermInvestments),
    netReceivables: decodeNullable(r.netReceivables),
    totalAssets: decodeNullable(r.totalAssets),
    revenue: decodeNullable(r.revenue),
    interestIncome: decodeNullable(r.interestIncome),
    sharesOutstanding: decodeNullable(r.sharesOutstanding),
  };
}
