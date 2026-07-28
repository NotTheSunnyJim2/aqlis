import { beforeEach, describe, expect, it } from "vitest";
import { PriceBuffer } from "../src/ingestion/price-buffer.js";

describe("PriceBuffer", () => {
  let buffer: PriceBuffer;

  beforeEach(() => {
    buffer = new PriceBuffer();
  });

  it("starts empty", () => {
    expect(buffer.size).toBe(0);
    expect(buffer.drain()).toEqual([]);
  });

  it("records a single price", () => {
    buffer.record("AAPL", 195.2, new Date("2026-07-10T14:30:00Z"));
    expect(buffer.size).toBe(1);
    expect(buffer.drain()).toEqual([
      { symbol: "AAPL", price: 195.2, observedAt: new Date("2026-07-10T14:30:00Z") },
    ]);
  });

  it("keeps only the latest price per symbol (last write wins)", () => {
    buffer.record("AAPL", 195.2, new Date("2026-07-10T14:30:00Z"));
    buffer.record("AAPL", 195.9, new Date("2026-07-10T14:30:05Z"));

    const drained = buffer.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]?.price).toBe(195.9);
  });

  it("ignores an out-of-order older tick", () => {
    buffer.record("AAPL", 195.9, new Date("2026-07-10T14:30:05Z"));
    // This one is stamped EARLIER but arrives later — must not clobber.
    buffer.record("AAPL", 195.2, new Date("2026-07-10T14:30:00Z"));

    expect(buffer.drain()[0]?.price).toBe(195.9);
  });

  it("buffers multiple symbols independently", () => {
    buffer.record("AAPL", 195.2, new Date("2026-07-10T14:30:00Z"));
    buffer.record("MSFT", 410.5, new Date("2026-07-10T14:30:01Z"));

    expect(buffer.size).toBe(2);
    const symbols = buffer.drain().map((p) => p.symbol).sort();
    expect(symbols).toEqual(["AAPL", "MSFT"]);
  });

  it("empties itself after draining", () => {
    buffer.record("AAPL", 195.2, new Date("2026-07-10T14:30:00Z"));
    buffer.drain();

    expect(buffer.size).toBe(0);
    expect(buffer.drain()).toEqual([]);
  });
});
