import { describe, expect, it } from "vitest";
import { parsePriceEntry } from "../src/consumers/price-entry.js";

describe("parsePriceEntry", () => {
  it("parses a well-formed entry, keeping price as a string", () => {
    const fields = ["symbol", "AAPL", "price", "195.2", "observedAt", "1720621800123"];

    expect(parsePriceEntry(fields)).toEqual({
      symbol: "AAPL",
      price: "195.2",
      observedAt: new Date(1720621800123),
    });
  });

  it("returns null when a field is missing", () => {
    expect(parsePriceEntry(["symbol", "AAPL", "price", "195.2"])).toBeNull();
  });

  it("returns null when observedAt is not numeric", () => {
    const fields = ["symbol", "AAPL", "price", "195.2", "observedAt", "not-a-number"];
    expect(parsePriceEntry(fields)).toBeNull();
  });
});
