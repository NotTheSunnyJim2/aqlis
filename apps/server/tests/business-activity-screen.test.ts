import { describe, expect, it } from "vitest";
import { screenBusinessActivity } from "../src/screening/business-activity-screen.js";

describe("screenBusinessActivity", () => {
  it("excludes MGM (Resorts & Casinos) on gambling", () => {
    const result = screenBusinessActivity({
      sector: "Consumer Cyclical",
      industry: "Resorts & Casinos",
    });
    expect(result).toEqual({
      pass: false,
      category: "GAMBLING",
      reason: "EXCLUDED_ACTIVITY:GAMBLING",
    });
  });

  it("passes TSLA (Auto Manufacturers) DESPITE sharing MGM's sector", () => {
    // The whole reason `industry` exists: same sector as MGM,
    // different industry, must NOT be excluded.
    const result = screenBusinessActivity({
      sector: "Consumer Cyclical",
      industry: "Auto Manufacturers",
    });
    expect(result.pass).toBe(true);
  });

  it("excludes JPM and BAC (Banks—Diversified) on conventional finance", () => {
    for (const industry of ["Banks—Diversified", "Banks—Regional"]) {
      const result = screenBusinessActivity({ sector: "Financial Services", industry });
      expect(result.pass).toBe(false);
      expect(result.category).toBe("CONVENTIONAL_FINANCIAL_SERVICES");
    }
  });

  it("passes AAPL, MSFT, NVDA, XOM, JNJ, T — the current clean watchlist entries", () => {
    const clean = [
      { sector: "Technology", industry: "Consumer Electronics" },
      { sector: "Technology", industry: "Software—Infrastructure" },
      { sector: "Technology", industry: "Semiconductors" },
      { sector: "Energy", industry: "Oil & Gas Integrated" },
      { sector: "Healthcare", industry: "Drug Manufacturers—General" },
      { sector: "Communication Services", industry: "Telecom Services" },
    ];
    for (const input of clean) {
      expect(screenBusinessActivity(input).pass).toBe(true);
    }
  });

  // Categories not present in the current watchlist, tested with
  // synthetic industries — a rules engine should be verified against
  // every rule it can match, not just today's ten companies.
  it("excludes alcohol producers", () => {
    const result = screenBusinessActivity({
      sector: "Consumer Defensive",
      industry: "Beverages—Wineries & Distilleries",
    });
    expect(result.category).toBe("ALCOHOL");
  });

  it("excludes tobacco producers", () => {
    const result = screenBusinessActivity({ sector: "Consumer Defensive", industry: "Tobacco" });
    expect(result.category).toBe("TOBACCO");
  });

  it("excludes pork producers", () => {
    const result = screenBusinessActivity({
      sector: "Consumer Defensive",
      industry: "Pork Products",
    });
    expect(result.category).toBe("PORK");
  });

  it("excludes pure-play defense contractors", () => {
    const result = screenBusinessActivity({
      sector: "Industrials",
      industry: "Aerospace & Defense",
    });
    expect(result.category).toBe("WEAPONS_AND_DEFENSE");
  });

  it("excludes adult entertainment", () => {
    const result = screenBusinessActivity({
      sector: "Communication Services",
      industry: "Adult Entertainment",
    });
    expect(result.category).toBe("ADULT_ENTERTAINMENT");
  });

  it("falls back to sector only when industry is unavailable", () => {
    const result = screenBusinessActivity({ sector: "Banks—Diversified", industry: null });
    expect(result.pass).toBe(false);
    expect(result.category).toBe("CONVENTIONAL_FINANCIAL_SERVICES");
  });

  it("reports MISSING_CLASSIFICATION (not a hard exclusion) when both are null", () => {
    const result = screenBusinessActivity({ sector: null, industry: null });
    expect(result).toEqual({
      pass: false,
      category: null,
      reason: "MISSING_CLASSIFICATION",
    });
  });

  it("does not false-positive on an unrelated industry containing no excluded keyword", () => {
    const result = screenBusinessActivity({
      sector: "Real Estate",
      industry: "REIT—Industrial",
    });
    expect(result.pass).toBe(true);
  });
});
