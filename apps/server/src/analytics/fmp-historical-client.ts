/** Minimal structural fetch — same shape as ingestion/fmp-client.ts. */
type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface FmpHistoricalClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

interface HistoricalPriceEntry {
  date: string;
  close: number;
}

/**
 * Fetches full daily-close history for a symbol from FMP's free-tier
 * `historical-price-eod/full` endpoint (confirmed live in Phase 20:
 * ~5 years of real daily closes per symbol, no separate signup needed
 * — same API key already used for fundamentals).
 *
 * Returns closes OLDEST-FIRST — FMP's response is newest-first, but
 * `analytics/returns.ts`'s computeLogReturns requires oldest-to-newest,
 * so the reversal happens here, once, at the I/O boundary, rather than
 * leaving every caller to remember it.
 */
export class FmpHistoricalClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly apiKey: string,
    options: FmpHistoricalClientOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? "https://financialmodelingprep.com/stable";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchDailyCloses(symbol: string): Promise<number[]> {
    const url =
      `${this.baseUrl}/historical-price-eod/full` +
      `?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;

    const response = await this.fetchImpl(url);
    if (!response.ok) {
      // Note: message excludes the URL, which carries the API key.
      throw new Error(`FMP historical-price-eod for ${symbol} failed: HTTP ${response.status}`);
    }

    const body = (await response.json()) as HistoricalPriceEntry[];
    return body
      .slice()
      .reverse()
      .map((entry) => entry.close);
  }
}
