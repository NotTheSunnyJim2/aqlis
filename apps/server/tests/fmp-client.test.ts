import { describe, expect, it } from "vitest";
import { FmpClient, FmpRequestError, isRetryableStatus } from "../src/ingestion/fmp-client.js";

const balanceSheet = [
  {
    date: "2026-03-28",
    symbol: "AAPL",
    reportedCurrency: "USD",
    fiscalYear: "2026",
    period: "Q2",
    acceptedDate: "2026-05-01 10:01:00",
    totalDebt: 84711000000,
    cashAndShortTermInvestments: 68507000000,
    netReceivables: 53511000000,
    totalAssets: 371082000000,
  },
];
const incomeStatement = [
  { revenue: 111184000000, interestIncome: 0, weightedAverageShsOutDil: 14768115000 },
];

/** A trivial ok=true JSON response, mirroring the Fetch API surface we use. */
function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

describe("FmpClient", () => {
  it("fetches both statements concurrently and merges them", async () => {
    const requestedUrls: string[] = [];
    const client = new FmpClient("test-key", {
      fetchImpl: (url) => {
        requestedUrls.push(url);
        return Promise.resolve(
          url.includes("balance-sheet-statement")
            ? jsonResponse(balanceSheet)
            : jsonResponse(incomeStatement),
        );
      },
    });

    const result = await client.fetchFundamentals("AAPL");

    expect(result?.symbol).toBe("AAPL");
    expect(result?.totalDebt).toBe(84711000000);
    expect(result?.sharesOutstanding).toBe(14768115000);
    // Both endpoints were actually called, for the requested symbol.
    expect(requestedUrls.some((u) => u.includes("balance-sheet-statement"))).toBe(true);
    expect(requestedUrls.some((u) => u.includes("income-statement"))).toBe(true);
    expect(requestedUrls.every((u) => u.includes("symbol=AAPL"))).toBe(true);
  });

  it("throws a redacted error (no api key) on a non-2xx response", async () => {
    const client = new FmpClient("super-secret-key", {
      fetchImpl: () =>
        Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) }),
    });

    await expect(client.fetchFundamentals("AAPL")).rejects.toThrow(/HTTP 429/);
    await expect(client.fetchFundamentals("AAPL")).rejects.not.toThrow(/super-secret-key/);
  });

  it("throws an FmpRequestError carrying the HTTP status", async () => {
    const client = new FmpClient("test-key", {
      fetchImpl: () =>
        Promise.resolve({ ok: false, status: 402, json: () => Promise.resolve({}) }),
    });

    await expect(client.fetchFundamentals("PG")).rejects.toBeInstanceOf(FmpRequestError);
    await expect(client.fetchFundamentals("PG")).rejects.toMatchObject({ status: 402 });
  });

  it("returns null when the balance sheet is empty even if income statement succeeds", async () => {
    const client = new FmpClient("test-key", {
      fetchImpl: (url) =>
        Promise.resolve(
          url.includes("balance-sheet-statement") ? jsonResponse([]) : jsonResponse(incomeStatement),
        ),
    });

    expect(await client.fetchFundamentals("AAPL")).toBeNull();
  });
});

describe("isRetryableStatus", () => {
  it("treats rate-limiting (429) as retryable", () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  it("treats server errors (5xx) as retryable", () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("treats client errors (4xx other than 429) as NOT retryable", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(402)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});
