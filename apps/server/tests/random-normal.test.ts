import { describe, expect, it } from "vitest";
import { randomNormal } from "../src/analytics/random-normal.js";

describe("randomNormal", () => {
  it("computes the exact Box-Muller transform for known uniform inputs", () => {
    // u1=0.5, u2=0.5 -> sqrt(-2*ln(0.5)) * cos(2*pi*0.5) = sqrt(2*ln2) * cos(pi)
    const values = [0.5, 0.5];
    let i = 0;
    const randomFn = () => values[i++]!;

    const result = randomNormal(randomFn);
    const expected = Math.sqrt(-2 * Math.log(0.5)) * Math.cos(2 * Math.PI * 0.5);
    expect(result).toBeCloseTo(expected, 10);
  });

  it("redraws u1 if it's exactly 0, to avoid ln(0) = -Infinity", () => {
    const values = [0, 0.3, 0.4]; // first u1=0 is skipped, then u1=0.3, u2=0.4
    let i = 0;
    const randomFn = () => values[i++]!;

    const result = randomNormal(randomFn);
    expect(Number.isFinite(result)).toBe(true);
    const expected = Math.sqrt(-2 * Math.log(0.3)) * Math.cos(2 * Math.PI * 0.4);
    expect(result).toBeCloseTo(expected, 10);
  });

  it("uses Math.random by default and produces varying finite values", () => {
    const samples = Array.from({ length: 20 }, () => randomNormal());
    expect(samples.every((n) => Number.isFinite(n))).toBe(true);
    expect(new Set(samples).size).toBeGreaterThan(1); // not all identical
  });
});
