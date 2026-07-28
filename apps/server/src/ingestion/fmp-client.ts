import { parseFundamentals, type ParsedFundamentals } from "./fmp-fundamentals.js";

/** Minimal structural fetch — the surface we use; global fetch satisfies it. */
type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface FmpClientOptions {
  baseUrl?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: FetchLike;
}

/** An FMP request failed at the HTTP level; carries the status for
 * retry-classification (see isRetryableStatus). */
export class FmpRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "FmpRequestError";
  }
}

/**
 * Whether a failed request is worth retrying.
 *
 * 429 (rate limited) and 5xx (server-side) are transient — the same
 * request may succeed moments later. 4xx client errors (401 bad key,
 * 402 symbol not in your plan, 404, ...) describe something that will
 * NEVER succeed by retrying; hammering FMP with the same doomed request
 * three times just burns quota and delays the failure being surfaced.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Fetches quarterly fundamentals from FMP's stable API and returns a
 * normalized snapshot.
 *
 * - Transport failures (non-2xx) throw, so the caller can retry.
 * - Usable-but-empty responses parse to null (no data this cycle).
 */
export class FmpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly apiKey: string,
    options: FmpClientOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? "https://financialmodelingprep.com/stable";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchFundamentals(symbol: string): Promise<ParsedFundamentals | null> {
    // Two independent requests — fetch concurrently to halve latency.
    const [balanceSheet, incomeStatement] = await Promise.all([
      this.fetchStatement("balance-sheet-statement", symbol),
      this.fetchStatement("income-statement", symbol),
    ]);
    return parseFundamentals(balanceSheet, incomeStatement);
  }

  private async fetchStatement(endpoint: string, symbol: string): Promise<unknown> {
    const url =
      `${this.baseUrl}/${endpoint}` +
      `?symbol=${encodeURIComponent(symbol)}&period=quarter&limit=1&apikey=${this.apiKey}`;

    const response = await this.fetchImpl(url);
    if (!response.ok) {
      // Note: message excludes the URL, which carries the API key.
      throw new FmpRequestError(
        `FMP ${endpoint} for ${symbol} failed: HTTP ${response.status}`,
        response.status,
      );
    }
    return response.json();
  }
}
