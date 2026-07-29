import { describe, expect, it } from "vitest";
import { computeVerdict } from "../src/screening/verdict.js";

/** Real AAPL figures from Phases 2/7 — a clean, fully-compliant case. */
const cleanAapl = {
  sector: "Technology",
  industry: "Consumer Electronics",
  price: 196,
  sharesOutstanding: 14_768_115_000,
  totalDebt: 84_711_000_000,
  cashAndShortTermInvestments: 68_507_000_000,
  netReceivables: 53_511_000_000,
  revenue: 111_184_000_000,
  interestIncome: 0,
};

describe("computeVerdict", () => {
  it("is COMPLIANT when every screen is known and passing (real AAPL data)", () => {
    const verdict = computeVerdict(cleanAapl);
    expect(verdict.status).toBe("COMPLIANT");
    expect(verdict.reasons).toEqual([]);
    expect(verdict.businessActivityPass).toBe(true);
  });

  it("is NON_COMPLIANT on a confirmed business-activity exclusion (MGM)", () => {
    const verdict = computeVerdict({
      ...cleanAapl,
      sector: "Consumer Cyclical",
      industry: "Resorts & Casinos",
    });
    expect(verdict.status).toBe("NON_COMPLIANT");
    expect(verdict.reasons).toContain("EXCLUDED_ACTIVITY:GAMBLING");
  });

  it("is NON_COMPLIANT on a ratio failure alone — the 'T' story: same debt, smaller market cap", () => {
    const verdict = computeVerdict({
      ...cleanAapl, // permissible business (Consumer Electronics — unchanged)
      price: 15, // shrink market cap drastically, debt unchanged
      sharesOutstanding: 6_000_000_000, // -> market cap $90bn, debt $84.7bn -> ~94%
    });
    expect(verdict.status).toBe("NON_COMPLIANT");
    expect(verdict.businessActivityPass).toBe(true); // the business itself is fine
    expect(verdict.reasons).toContain("RATIO_EXCEEDED:DEBT");
  });

  it("is UNKNOWN when a required input is simply missing (no price yet)", () => {
    const verdict = computeVerdict({ ...cleanAapl, price: null });
    expect(verdict.status).toBe("UNKNOWN");
    expect(verdict.marketCap).toBeNull();
    expect(verdict.reasons).toEqual(
      expect.arrayContaining([
        "UNKNOWN:DEBT_RATIO",
        "UNKNOWN:CASH_RATIO",
        "UNKNOWN:RECEIVABLES_RATIO",
      ]),
    );
  });

  it("PRECEDENCE: a confirmed exclusion overrides unrelated missing data — stays NON_COMPLIANT, not UNKNOWN", () => {
    const verdict = computeVerdict({
      ...cleanAapl,
      sector: "Consumer Cyclical",
      industry: "Resorts & Casinos", // confirmed exclusion
      price: null, // ALSO missing unrelated data
    });
    expect(verdict.status).toBe("NON_COMPLIANT");
    expect(verdict.reasons).toContain("EXCLUDED_ACTIVITY:GAMBLING");
    expect(verdict.reasons).toContain("UNKNOWN:DEBT_RATIO");
  });

  it("PRECEDENCE: a ratio failure overrides a merely-unknown business classification", () => {
    const verdict = computeVerdict({
      ...cleanAapl,
      sector: null,
      industry: null, // classification unknown, not excluded
      price: 15,
      sharesOutstanding: 6_000_000_000, // debt ratio now fails
    });
    expect(verdict.status).toBe("NON_COMPLIANT");
    expect(verdict.businessActivityPass).toBeNull(); // genuinely unknown, not false
    expect(verdict.reasons).toContain("UNKNOWN:BUSINESS_ACTIVITY_CLASSIFICATION");
    expect(verdict.reasons).toContain("RATIO_EXCEEDED:DEBT");
  });

  it("carries the computed ratios through even on a NON_COMPLIANT verdict (audit trail)", () => {
    const verdict = computeVerdict({
      ...cleanAapl,
      price: 15,
      sharesOutstanding: 6_000_000_000,
    });
    expect(verdict.debtRatio).not.toBeNull();
    expect(verdict.debtRatio).toBeGreaterThan(0.33);
  });
});
