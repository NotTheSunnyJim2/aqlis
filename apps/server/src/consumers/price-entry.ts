import { fieldsToRecord } from "./stream-entry.js";

export interface PriceStreamEntry {
  symbol: string;
  /**
   * Kept as a STRING, not converted to a JS number. The value already
   * passed through one float64 round-trip (Finnhub JSON -> number ->
   * toString() in the publisher); converting it back to a number here
   * just to hand it to Prisma would be a second, pointless round-trip.
   * Prisma's Decimal fields accept strings directly and store them
   * exactly — so the string rides untouched from Redis to Postgres.
   */
  price: string;
  observedAt: Date;
}

/** Parses one prices:stream entry. Returns null for a malformed entry
 * (missing/unparseable field) — the caller logs and leaves it pending
 * rather than crashing the consumer loop over one bad row. */
export function parsePriceEntry(fields: string[]): PriceStreamEntry | null {
  const record = fieldsToRecord(fields);
  const { symbol, price, observedAt } = record;

  if (!symbol || !price || !observedAt) {
    return null;
  }

  const observedAtMs = Number(observedAt);
  if (!Number.isFinite(observedAtMs)) {
    return null;
  }

  return { symbol, price, observedAt: new Date(observedAtMs) };
}
