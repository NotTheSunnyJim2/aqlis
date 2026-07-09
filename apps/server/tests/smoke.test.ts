import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs TypeScript and evaluates assertions", () => {
    const meaningOfLife: number = 40 + 2;
    expect(meaningOfLife).toBe(42);
  });
});
