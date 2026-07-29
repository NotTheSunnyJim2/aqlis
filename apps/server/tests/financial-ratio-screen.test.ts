import { describe, expect, it } from "vitest";
import {
  computeMarketCap,
  screenFinancialRatios,
} from "../src/screening/financial-ratio-screen.js";

describe("computeMarketCap", () => {
  it("multiplies price by diluted shares outstanding", () => {
    expect(computeMarketCap(196, 14_768_115_000)).toBe(2_894_550_540_000);
  });

  it("returns null when either input is missing", () => {
    expect(computeMarketCap(null, 14_768_115_000)).toBeNull();
    expect(computeMarketCap(196, null)).toBeNull();
  });
});

describe("screenFinancialRatios", () => {
  it("passes AAPL's real Phase 2/7 debt figure by a wide margin (~2.93%)", () => {
    const marketCap = computeMarketCap(196, 14_768_115_000)!;
    const result = screenFinancialRatios({
      marketCap,
      totalDebt: 84_711_000_000,
      cashAndShortTermInvestments: 68_507_000_000,
      netReceivables: 53_511_000_000,
    });

    expect(result.debt.pass).toBe(true);
    expect(result.debt.ratio).toBeCloseTo(0.0293, 4);
  });

  it("fails the debt ratio when the SAME debt sits on a much smaller market cap", () => {
    // Illustrates the "T" story: identical debt, smaller denominator,
    // opposite verdict — a company can fail purely on financing.
    const result = screenFinancialRatios({
      marketCap: 150_000_000_000, // ~$150bn, not $2.9tn
      totalDebt: 84_711_000_000,
      cashAndShortTermInvestments: 0,
      netReceivables: 0,
    });

    expect(result.debt.pass).toBe(false);
    expect(result.debt.ratio).toBeCloseTo(0.5647, 4);
  });

  it("treats a ratio exactly AT the 33% threshold as failing (strict <, not <=)", () => {
    const result = screenFinancialRatios({
      marketCap: 100,
      totalDebt: 33,
      cashAndShortTermInvestments: 0,
      netReceivables: 0,
    });
    expect(result.debt.pass).toBe(false);
  });

  it("reports null (unknown), never a false pass, when debt is missing", () => {
    const result = screenFinancialRatios({
      marketCap: 100,
      totalDebt: null,
      cashAndShortTermInvestments: 10,
      netReceivables: 10,
    });
    expect(result.debt).toEqual({ ratio: null, pass: null });
    // Other ratios are independent — a missing debt figure doesn't
    // block computing the ones we DO have data for.
    expect(result.cash.pass).toBe(true);
  });

  it("reports null when market cap itself is unknown (no price yet)", () => {
    const result = screenFinancialRatios({
      marketCap: null,
      totalDebt: 84_711_000_000,
      cashAndShortTermInvestments: 68_507_000_000,
      netReceivables: 53_511_000_000,
    });
    expect(result.debt).toEqual({ ratio: null, pass: null });
    expect(result.cash).toEqual({ ratio: null, pass: null });
    expect(result.receivables).toEqual({ ratio: null, pass: null });
  });

  it("scores the cash and receivables ratios independently of debt", () => {
    const marketCap = computeMarketCap(196, 14_768_115_000)!;
    const result = screenFinancialRatios({
      marketCap,
      totalDebt: 84_711_000_000,
      cashAndShortTermInvestments: 68_507_000_000,
      netReceivables: 53_511_000_000,
    });

    expect(result.cash.pass).toBe(true);
    expect(result.receivables.pass).toBe(true);
  });
});
