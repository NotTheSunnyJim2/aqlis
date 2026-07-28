import { describe, expect, it } from "vitest";
import { parseFundamentals } from "../src/ingestion/fmp-fundamentals.js";

// Realistic FMP shapes: arrays of objects with many extra columns.
const balanceSheet = [
  {
    date: "2026-03-28",
    symbol: "AAPL",
    reportedCurrency: "USD",
    fiscalYear: "2026",
    period: "Q2",
    acceptedDate: "2026-05-01 10:01:00",
    cashAndShortTermInvestments: 68507000000,
    netReceivables: 53511000000,
    totalAssets: 371082000000,
    totalDebt: 84711000000,
    someOtherColumn: 123,
  },
];

const incomeStatement = [
  {
    date: "2026-03-28",
    symbol: "AAPL",
    period: "Q2",
    revenue: 111184000000,
    interestIncome: 0,
    weightedAverageShsOutDil: 14768115000,
    ebitda: 39324000000,
  },
];

describe("parseFundamentals", () => {
  it("merges balance sheet and income statement into one snapshot", () => {
    const result = parseFundamentals(balanceSheet, incomeStatement);

    expect(result).toEqual({
      symbol: "AAPL",
      periodEndDate: new Date("2026-03-28"),
      period: "Q2",
      fiscalYear: "2026",
      acceptedAt: new Date("2026-05-01T10:01:00"),
      reportedCurrency: "USD",
      totalDebt: 84711000000,
      cashAndShortTermInvestments: 68507000000,
      netReceivables: 53511000000,
      totalAssets: 371082000000,
      revenue: 111184000000,
      interestIncome: 0,
      sharesOutstanding: 14768115000,
    });
  });

  it("preserves a real zero (interestIncome: 0 is not 'missing')", () => {
    const result = parseFundamentals(balanceSheet, incomeStatement);
    expect(result?.interestIncome).toBe(0);
  });

  it("produces a partial snapshot when the income statement is absent", () => {
    const result = parseFundamentals(balanceSheet, []);

    expect(result?.totalDebt).toBe(84711000000);
    expect(result?.revenue).toBeNull();
    expect(result?.sharesOutstanding).toBeNull();
  });

  it("returns null when the balance sheet is empty (unusable — caller retries)", () => {
    expect(parseFundamentals([], incomeStatement)).toBeNull();
  });

  it("returns null when the balance sheet payload is not an array", () => {
    expect(parseFundamentals({ "Error Message": "Invalid API KEY" }, incomeStatement)).toBeNull();
  });
});
