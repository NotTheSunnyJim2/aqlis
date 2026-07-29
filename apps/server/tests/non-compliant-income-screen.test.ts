import { describe, expect, it } from "vitest";
import { screenNonCompliantIncome } from "../src/screening/non-compliant-income-screen.js";

describe("screenNonCompliantIncome", () => {
  it("passes AAPL's real Phase 7 data (interestIncome: 0 -> ratio 0%)", () => {
    const result = screenNonCompliantIncome({
      revenue: 111_184_000_000,
      interestIncome: 0,
    });
    expect(result).toEqual({ ratio: 0, pass: true });
  });

  it("passes at 4% interest income", () => {
    const result = screenNonCompliantIncome({ revenue: 100_000_000, interestIncome: 4_000_000 });
    expect(result.pass).toBe(true);
    expect(result.ratio).toBeCloseTo(0.04, 5);
  });

  it("fails at 6% interest income", () => {
    const result = screenNonCompliantIncome({ revenue: 100_000_000, interestIncome: 6_000_000 });
    expect(result.pass).toBe(false);
    expect(result.ratio).toBeCloseTo(0.06, 5);
  });

  it("treats exactly 5% as failing (strict <, not <=)", () => {
    const result = screenNonCompliantIncome({ revenue: 100, interestIncome: 5 });
    expect(result.pass).toBe(false);
  });

  it("reports null (unknown) when either input is missing", () => {
    expect(screenNonCompliantIncome({ revenue: null, interestIncome: 0 })).toEqual({
      ratio: null,
      pass: null,
    });
    expect(screenNonCompliantIncome({ revenue: 100, interestIncome: null })).toEqual({
      ratio: null,
      pass: null,
    });
  });
});
