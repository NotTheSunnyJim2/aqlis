import { describe, expect, it } from "vitest";
import { FmpHistoricalClient } from "../src/analytics/fmp-historical-client.js";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

describe("FmpHistoricalClient", () => {
  it("reverses FMP's newest-first response to oldest-first", async () => {
    const client = new FmpHistoricalClient("test-key", {
      fetchImpl: () =>
        Promise.resolve(
          jsonResponse([
            { date: "2026-07-30", close: 333.43 },
            { date: "2026-07-29", close: 338.19 },
            { date: "2026-07-28", close: 340.08 },
          ]),
        ),
    });

    const closes = await client.fetchDailyCloses("AAPL");
    expect(closes).toEqual([340.08, 338.19, 333.43]);
  });

  it("includes the symbol in the request URL", async () => {
    let requestedUrl = "";
    const client = new FmpHistoricalClient("test-key", {
      fetchImpl: (url) => {
        requestedUrl = url;
        return Promise.resolve(jsonResponse([]));
      },
    });

    await client.fetchDailyCloses("MSFT");
    expect(requestedUrl).toContain("symbol=MSFT");
    expect(requestedUrl).toContain("historical-price-eod/full");
  });

  it("throws a redacted error (no api key) on a non-2xx response", async () => {
    const client = new FmpHistoricalClient("super-secret-key", {
      fetchImpl: () =>
        Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) }),
    });

    await expect(client.fetchDailyCloses("AAPL")).rejects.toThrow(/HTTP 429/);
    await expect(client.fetchDailyCloses("AAPL")).rejects.not.toThrow(/super-secret-key/);
  });
});
