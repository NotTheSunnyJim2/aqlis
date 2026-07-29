import { describe, expect, it } from "vitest";
import { calculatePurification } from "../src/screening/purification.js";

describe("calculatePurification", () => {
  it("computes the worked example: $500 dividend at a 2% ratio -> $10 purified, $490 net", () => {
    const result = calculatePurification({ dividendReceived: 500, nonCompliantIncomeRatio: 0.02 });
    expect(result).toEqual({
      dividendReceived: 500,
      nonCompliantIncomeRatio: 0.02,
      purificationAmount: 10,
      netAmount: 490,
    });
  });

  it("purifies nothing for a genuinely clean company (ratio 0, e.g. real AAPL data)", () => {
    const result = calculatePurification({ dividendReceived: 500, nonCompliantIncomeRatio: 0 });
    expect(result.purificationAmount).toBe(0);
    expect(result.netAmount).toBe(500);
  });

  it("reports null (unknown), never a false zero, when the ratio is unknown", () => {
    const result = calculatePurification({ dividendReceived: 500, nonCompliantIncomeRatio: null });
    expect(result).toEqual({
      dividendReceived: 500,
      nonCompliantIncomeRatio: null,
      purificationAmount: null,
      netAmount: null,
    });
  });

  it("purifies the full dividend at a 100% ratio", () => {
    const result = calculatePurification({ dividendReceived: 500, nonCompliantIncomeRatio: 1 });
    expect(result.purificationAmount).toBe(500);
    expect(result.netAmount).toBe(0);
  });

  it("computes correctly near the 5% screening threshold (still valid math above the tolerance line)", () => {
    // The 5% line is a SCREENING concern (Phase 9); this calculator
    // just does the arithmetic regardless of what the ratio implies
    // for overall compliance.
    const result = calculatePurification({ dividendReceived: 1000, nonCompliantIncomeRatio: 0.08 });
    expect(result.purificationAmount).toBeCloseTo(80, 5);
    expect(result.netAmount).toBeCloseTo(920, 5);
  });

  it("handles a zero dividend without error", () => {
    const result = calculatePurification({ dividendReceived: 0, nonCompliantIncomeRatio: 0.02 });
    expect(result.purificationAmount).toBe(0);
    expect(result.netAmount).toBe(0);
  });
});
