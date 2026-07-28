import { describe, expect, it } from "vitest";
import { parseFundamentalsEntry } from "../src/consumers/fundamentals-entry.js";

const fullFields = [
  "symbol",
  "AAPL",
  "periodEndDate",
  "1774656000000",
  "period",
  "Q2",
  "fiscalYear",
  "2026",
  "acceptedAt",
  "1777982460000",
  "reportedCurrency",
  "USD",
  "totalDebt",
  "84711000000",
  "cashAndShortTermInvestments",
  "68507000000",
  "netReceivables",
  "53511000000",
  "totalAssets",
  "371082000000",
  "revenue",
  "111184000000",
  "interestIncome",
  "0",
  "sharesOutstanding",
  "14768115000",
];

describe("parseFundamentalsEntry", () => {
  it("parses a fully-populated entry", () => {
    const result = parseFundamentalsEntry(fullFields);

    expect(result?.symbol).toBe("AAPL");
    expect(result?.period).toBe("Q2");
    expect(result?.totalDebt).toBe("84711000000");
    expect(result?.acceptedAt).toEqual(new Date(1777982460000));
  });

  it("decodes the literal string \"null\" as null (missing != zero)", () => {
    const fields = [...fullFields];
    const idx = fields.indexOf("interestIncome");
    fields[idx + 1] = "null";

    expect(parseFundamentalsEntry(fields)?.interestIncome).toBeNull();
  });

  it("preserves a real zero distinctly from null", () => {
    expect(parseFundamentalsEntry(fullFields)?.interestIncome).toBe("0");
  });

  it("returns null when a required identity field is missing", () => {
    const withoutFiscalYear = ["symbol", "AAPL", "period", "Q2", "acceptedAt", "1777982460000"];
    expect(parseFundamentalsEntry(withoutFiscalYear)).toBeNull();
  });

  it("returns null when the entry is empty", () => {
    expect(parseFundamentalsEntry([])).toBeNull();
  });
});
