import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

/** A minimal valid environment; individual tests override fields. */
const validEnv = {
  REDIS_URL: "rediss://default:pw@example.upstash.io:6379",
  FINNHUB_API_KEY: "test-key",
  FMP_API_KEY: "test-fmp-key",
  WATCHLIST_SYMBOLS: "AAPL,MSFT",
  PRICE_FLUSH_INTERVAL_SECONDS: "30",
} satisfies NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("parses a valid environment into typed config", () => {
    const config = loadConfig(validEnv);

    expect(config.redisUrl).toBe(validEnv.REDIS_URL);
    expect(config.finnhubApiKey).toBe("test-key");
    expect(config.watchlist).toEqual(["AAPL", "MSFT"]);
    // Seconds are converted to milliseconds at the boundary.
    expect(config.priceFlushIntervalMs).toBe(30_000);
    // Fundamentals poll defaults to 6h when unset.
    expect(config.fundamentalsPollIntervalMs).toBe(21_600_000);
  });

  it("upper-cases and de-duplicates the watchlist", () => {
    const config = loadConfig({ ...validEnv, WATCHLIST_SYMBOLS: "aapl, AAPL ,msft" });
    expect(config.watchlist).toEqual(["AAPL", "MSFT"]);
  });

  it("defaults the flush interval when the var is absent", () => {
    const { PRICE_FLUSH_INTERVAL_SECONDS, ...withoutInterval } = validEnv;
    void PRICE_FLUSH_INTERVAL_SECONDS;
    const config = loadConfig(withoutInterval);
    expect(config.priceFlushIntervalMs).toBe(30_000);
  });

  it("throws when a required variable is missing", () => {
    const { FINNHUB_API_KEY, ...withoutKey } = validEnv;
    void FINNHUB_API_KEY;
    expect(() => loadConfig(withoutKey)).toThrow(/FINNHUB_API_KEY/);
  });

  it("throws when the FMP key is missing", () => {
    const { FMP_API_KEY, ...withoutFmp } = validEnv;
    void FMP_API_KEY;
    expect(() => loadConfig(withoutFmp)).toThrow(/FMP_API_KEY/);
  });

  it("rejects a non-TLS Redis URL", () => {
    expect(() => loadConfig({ ...validEnv, REDIS_URL: "redis://localhost:6379" })).toThrow(
      /rediss:\/\//,
    );
  });

  it("rejects a watchlist with no usable symbols", () => {
    expect(() => loadConfig({ ...validEnv, WATCHLIST_SYMBOLS: " , , " })).toThrow(/ticker/);
  });
});
