import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StockList } from "../src/components/StockList.js";
import type { CompanySummary } from "../src/lib/api.js";

function stubFetchJson(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

const aapl: CompanySummary = {
  symbol: "AAPL",
  name: "Apple Inc.",
  status: "COMPLIANT",
  latestPrice: "196.5",
  computedAt: "2026-07-30T12:00:00.000Z",
};

describe("StockList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading state before the fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined))); // never resolves
    render(<StockList />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders each company with its symbol, price, and badge once loaded", async () => {
    stubFetchJson({ companies: [aapl] });
    render(<StockList />);

    expect(await screen.findByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("Apple Inc.")).toBeInTheDocument();
    expect(screen.getByText("$196.5")).toBeInTheDocument();
    expect(screen.getByText("Compliant")).toBeInTheDocument();
  });

  it("renders an em dash for a company with no price yet, not blank or crash", async () => {
    stubFetchJson({
      companies: [{ ...aapl, latestPrice: null, status: null }],
    });
    render(<StockList />);

    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    stubFetchJson({}, false, 500);
    render(<StockList />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to load companies");
  });
});
