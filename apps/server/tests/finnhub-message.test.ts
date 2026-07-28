import { describe, expect, it } from "vitest";
import { parseTradeMessage } from "../src/ingestion/finnhub-message.js";

describe("parseTradeMessage", () => {
  it("extracts a single trade", () => {
    const raw = JSON.stringify({
      type: "trade",
      data: [{ s: "AAPL", p: 195.2, t: 1720621800123, v: 100, c: [] }],
    });

    expect(parseTradeMessage(raw)).toEqual([
      { symbol: "AAPL", price: 195.2, timestampMs: 1720621800123 },
    ]);
  });

  it("extracts multiple trades from one frame", () => {
    const raw = JSON.stringify({
      type: "trade",
      data: [
        { s: "AAPL", p: 195.2, t: 1720621800123 },
        { s: "MSFT", p: 410.5, t: 1720621800200 },
      ],
    });

    expect(parseTradeMessage(raw)).toHaveLength(2);
  });

  it("returns nothing for a ping keepalive", () => {
    expect(parseTradeMessage(JSON.stringify({ type: "ping" }))).toEqual([]);
  });

  it("returns nothing for a non-trade message", () => {
    expect(parseTradeMessage(JSON.stringify({ type: "error", msg: "bad symbol" }))).toEqual([]);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseTradeMessage("not json{")).toThrow();
  });
});
