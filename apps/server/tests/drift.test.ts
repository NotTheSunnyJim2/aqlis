import { describe, expect, it } from "vitest";
import { detectDrift, type DriftComparableVerdict } from "../src/screening/drift.js";

const verdict = (overrides: Partial<DriftComparableVerdict> = {}): DriftComparableVerdict => ({
  status: "COMPLIANT",
  debtRatio: 0.0293, // AAPL's real Phase 9 figure
  cashRatio: 0.0237,
  receivablesRatio: 0.0185,
  nonCompliantIncomeRatio: 0,
  ...overrides,
});

describe("detectDrift", () => {
  it("produces no events for a company's first-ever verdict (nothing to drift FROM)", () => {
    expect(detectDrift(null, verdict())).toEqual([]);
  });

  it("produces no events when nothing changed", () => {
    expect(detectDrift(verdict(), verdict())).toEqual([]);
  });

  it("flags VERDICT_FLIPPED when the overall status changes", () => {
    const events = detectDrift(
      verdict({ status: "COMPLIANT" }),
      verdict({ status: "NON_COMPLIANT" }),
    );
    expect(events).toContainEqual({
      type: "VERDICT_FLIPPED",
      ratio: null,
      previousValue: null,
      currentValue: null,
      threshold: null,
    });
  });

  it("flags VERDICT_FLIPPED for a transition into or out of UNKNOWN too", () => {
    const events = detectDrift(
      verdict({ status: "COMPLIANT" }),
      verdict({ status: "UNKNOWN" }),
    );
    expect(events.some((e) => e.type === "VERDICT_FLIPPED")).toBe(true);
  });

  it("flags a ratio crossing the threshold upward — the 'T' story", () => {
    // Same shape as Phase 9's verdict test: identical business, market
    // cap shrinks, debt ratio crosses 33% from comfortably under it.
    const events = detectDrift(
      verdict({ status: "COMPLIANT", debtRatio: 0.0293 }),
      verdict({ status: "NON_COMPLIANT", debtRatio: 0.5647 }),
    );
    expect(events).toContainEqual({
      type: "RATIO_THRESHOLD_CROSSED",
      ratio: "DEBT",
      previousValue: 0.0293,
      currentValue: 0.5647,
      threshold: 0.33,
    });
  });

  it("flags a ratio crossing back UNDER the threshold — recovery, not just breach", () => {
    const events = detectDrift(
      verdict({ status: "NON_COMPLIANT", debtRatio: 0.4 }),
      verdict({ status: "COMPLIANT", debtRatio: 0.2 }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "RATIO_THRESHOLD_CROSSED", ratio: "DEBT" }),
    );
  });

  it("does NOT flag a ratio that moved but stayed on the same side of the line", () => {
    const events = detectDrift(
      verdict({ debtRatio: 0.10 }),
      verdict({ debtRatio: 0.15 }), // both comfortably under 0.33
    );
    expect(events).toEqual([]);
  });

  it("uses the 5% threshold for the income ratio, not the 33% ratio threshold", () => {
    const events = detectDrift(
      verdict({ nonCompliantIncomeRatio: 0.03 }),
      verdict({ nonCompliantIncomeRatio: 0.07 }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ ratio: "NON_COMPLIANT_INCOME", threshold: 0.05 }),
    );
  });

  it("skips a ratio when either side is unknown — cannot claim a crossing without both endpoints", () => {
    const events = detectDrift(
      verdict({ debtRatio: null }),
      verdict({ debtRatio: 0.5 }), // looks like a breach, but no prior value to compare
    );
    expect(events.some((e) => e.ratio === "DEBT")).toBe(false);
  });

  it("reports multiple simultaneous crossings independently", () => {
    const events = detectDrift(
      verdict({ status: "COMPLIANT", debtRatio: 0.1, cashRatio: 0.1 }),
      verdict({ status: "NON_COMPLIANT", debtRatio: 0.5, cashRatio: 0.5 }),
    );
    const types = events.map((e) => e.ratio ?? e.type);
    expect(types).toEqual(
      expect.arrayContaining(["VERDICT_FLIPPED", "DEBT", "CASH"]),
    );
    expect(events).toHaveLength(3);
  });
});
