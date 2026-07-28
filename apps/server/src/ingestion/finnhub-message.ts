import { z } from "zod";

/** A single normalized trade extracted from a Finnhub message. */
export interface FinnhubTrade {
  symbol: string;
  price: number;
  /** Event time from Finnhub's `t` field (epoch milliseconds). */
  timestampMs: number;
}

/**
 * Finnhub trade message shape. External data is untrusted, so we parse
 * it through a schema at the boundary (same discipline as env config)
 * rather than trusting field access on `any`.
 *
 *   { "type": "trade",
 *     "data": [ { "s": "AAPL", "p": 195.2, "t": 1720621800123, "v": 100 } ] }
 */
const tradeMessageSchema = z.object({
  type: z.literal("trade"),
  data: z.array(
    z.object({
      s: z.string(),
      p: z.number(),
      t: z.number(),
    }),
  ),
});

/**
 * Parse a raw Finnhub WebSocket frame into trades.
 *
 * - Trade messages -> the contained trades, normalized.
 * - Any other known message (`{"type":"ping"}`, errors, etc.) -> []
 *   (valid, just not trades — the caller simply has nothing to record).
 *
 * Throws only on malformed JSON, which is genuinely unexpected and the
 * caller should log.
 */
export function parseTradeMessage(raw: string): FinnhubTrade[] {
  const json: unknown = JSON.parse(raw);

  const result = tradeMessageSchema.safeParse(json);
  if (!result.success) {
    return [];
  }

  return result.data.data.map((trade) => ({
    symbol: trade.s,
    price: trade.p,
    timestampMs: trade.t,
  }));
}
