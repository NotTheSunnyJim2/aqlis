/** A single price observation, ready to be written to the stream. */
export interface BufferedPrice {
  symbol: string;
  price: number;
  /** Event time: when the trade happened at the exchange (Finnhub `t`). */
  observedAt: Date;
}

/**
 * In-memory, last-write-wins price buffer.
 *
 * Finnhub can deliver many trades per second per symbol; writing each
 * one to Redis would blow the Upstash free-tier command budget (see
 * ADR / price worker notes). Instead the worker records every tick
 * here and periodically `drain()`s the latest price per symbol, so we
 * emit at most one stream entry per symbol per flush window.
 *
 * Pure and I/O-free on purpose: no timers, no Redis — just the
 * aggregation logic, so it can be unit-tested exhaustively.
 */
export class PriceBuffer {
  private readonly latest = new Map<string, BufferedPrice>();

  /**
   * Record a tick. Keeps only the most recent observation per symbol,
   * compared by event time — so an out-of-order older tick can't
   * clobber a newer price we already hold.
   */
  record(symbol: string, price: number, observedAt: Date): void {
    const existing = this.latest.get(symbol);
    if (existing && existing.observedAt.getTime() > observedAt.getTime()) {
      return;
    }
    this.latest.set(symbol, { symbol, price, observedAt });
  }

  /** Number of symbols currently buffered (i.e. pending a flush). */
  get size(): number {
    return this.latest.size;
  }

  /**
   * Return all buffered prices and clear the buffer. Called once per
   * flush window; an empty result means nothing to write (e.g. market
   * closed) and the caller should skip Redis entirely.
   */
  drain(): BufferedPrice[] {
    const prices = [...this.latest.values()];
    this.latest.clear();
    return prices;
  }
}
