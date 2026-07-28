import type { Redis } from "ioredis";
import type { ParsedFundamentals } from "./fmp-fundamentals.js";

/** The Redis Stream key that fundamentals snapshots are appended to. */
export const FUNDAMENTALS_STREAM_KEY = "fundamentals:stream";

/** Hash key tracking, per symbol, the acceptedAt of the last published filing. */
const LAST_ACCEPTED_KEY = "fundamentals:last-accepted";

export interface FundamentalsPublisherOptions {
  streamKey?: string;
  maxLen?: number;
}

/**
 * Publishes a fundamentals snapshot to the stream, but ONLY if it's
 * genuinely new — i.e. its acceptedAt is newer than the last filing we
 * published for that symbol. Filings change ~4x/year; polling every 6h
 * would otherwise re-publish the same unchanged snapshot ~360 times
 * between filings, wasting stream space and Upstash command quota.
 *
 * The "last seen" cursor lives in Redis (a hash), not in-process memory,
 * so a worker restart doesn't forget and start duplicating again.
 */
export class FundamentalsPublisher {
  private readonly streamKey: string;
  private readonly maxLen: number;

  constructor(
    private readonly redis: Redis,
    options: FundamentalsPublisherOptions = {},
  ) {
    this.streamKey = options.streamKey ?? FUNDAMENTALS_STREAM_KEY;
    this.maxLen = options.maxLen ?? 2_000;
  }

  /** Returns true if a new snapshot was published, false if it was a duplicate. */
  async publishIfNew(snapshot: ParsedFundamentals): Promise<boolean> {
    const lastAcceptedRaw = await this.redis.hget(LAST_ACCEPTED_KEY, snapshot.symbol);
    const lastAcceptedMs = lastAcceptedRaw ? Number(lastAcceptedRaw) : 0;

    if (snapshot.acceptedAt.getTime() <= lastAcceptedMs) {
      return false;
    }

    await this.redis
      .pipeline()
      .xadd(
        this.streamKey,
        "MAXLEN",
        "~",
        this.maxLen,
        "*",
        "symbol",
        snapshot.symbol,
        "periodEndDate",
        snapshot.periodEndDate.getTime().toString(),
        "period",
        snapshot.period,
        "fiscalYear",
        snapshot.fiscalYear,
        "acceptedAt",
        snapshot.acceptedAt.getTime().toString(),
        "reportedCurrency",
        snapshot.reportedCurrency,
        // Nullable financials: encode absence as the literal string "null"
        // (a stream field can't BE null) — the consumer decodes it back.
        "totalDebt",
        encodeNullable(snapshot.totalDebt),
        "cashAndShortTermInvestments",
        encodeNullable(snapshot.cashAndShortTermInvestments),
        "netReceivables",
        encodeNullable(snapshot.netReceivables),
        "totalAssets",
        encodeNullable(snapshot.totalAssets),
        "revenue",
        encodeNullable(snapshot.revenue),
        "interestIncome",
        encodeNullable(snapshot.interestIncome),
        "sharesOutstanding",
        encodeNullable(snapshot.sharesOutstanding),
      )
      .hset(LAST_ACCEPTED_KEY, snapshot.symbol, snapshot.acceptedAt.getTime().toString())
      .exec();

    return true;
  }
}

function encodeNullable(value: number | null): string {
  return value === null ? "null" : value.toString();
}
