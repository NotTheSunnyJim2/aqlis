import type { Redis } from "ioredis";
import type { BufferedPrice } from "./price-buffer.js";

/** The Redis Stream key that price snapshots are appended to. */
export const PRICES_STREAM_KEY = "prices:stream";

export interface PricePublisherOptions {
  streamKey?: string;
  /**
   * Approximate maximum entries to retain in the stream. Bounds memory
   * so the stream can't grow forever and exhaust Upstash storage; `~`
   * (approximate) trimming lets Redis trim in efficient batches.
   */
  maxLen?: number;
}

/**
 * Writes buffered prices to the Redis Stream, one entry per symbol.
 * Uses a pipeline so a whole flush is a single network round-trip.
 */
export class PricePublisher {
  private readonly streamKey: string;
  private readonly maxLen: number;

  constructor(
    private readonly redis: Redis,
    options: PricePublisherOptions = {},
  ) {
    this.streamKey = options.streamKey ?? PRICES_STREAM_KEY;
    this.maxLen = options.maxLen ?? 10_000;
  }

  /**
   * Append each price as a stream entry. Returns the number written.
   * A single pipeline batches all XADDs into one round-trip to Redis
   * (latency win — note it does NOT reduce the Upstash command count,
   * which bills each XADD in the pipeline separately).
   */
  async publish(prices: BufferedPrice[]): Promise<number> {
    if (prices.length === 0) {
      return 0;
    }

    const pipeline = this.redis.pipeline();
    for (const price of prices) {
      pipeline.xadd(
        this.streamKey,
        "MAXLEN",
        "~",
        this.maxLen,
        "*", // let Redis assign the time-ordered entry ID
        "symbol",
        price.symbol,
        "price",
        price.price.toString(),
        // Event time as epoch millis; the consumer parses it back.
        "observedAt",
        price.observedAt.getTime().toString(),
      );
    }

    const results = await pipeline.exec();

    // pipeline.exec resolves to an array of [error, result] tuples.
    // Surface any per-command failure instead of silently dropping it.
    if (results) {
      for (const [err] of results) {
        if (err) throw err;
      }
    }

    return prices.length;
  }
}
