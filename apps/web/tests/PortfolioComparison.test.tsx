import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortfolioComparison } from "../src/components/PortfolioComparison.js";
import type { PortfolioComparison as PortfolioComparisonData } from "../src/lib/api.js";

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

function makePercentileDay(day: number, p50: number) {
  return { day, p5: p50 - 0.2, p25: p50 - 0.1, p50, p75: p50 + 0.1, p95: p50 + 0.2 };
}

const comparison: PortfolioComparisonData = {
  halalSymbols: ["AAPL", "MSFT"],
  conventionalSymbols: ["AAPL", "MSFT", "JPM"],
  halal: {
    percentilesByDay: [makePercentileDay(0, 1), makePercentileDay(252, 1.2)],
    finalValue: { mean: 1.2, stdev: 0.3, p5: 0.8, p50: 1.17, p95: 1.7, probabilityOfLoss: 0.268 },
  },
  conventional: {
    percentilesByDay: [makePercentileDay(0, 1), makePercentileDay(252, 1.15)],
    finalValue: { mean: 1.15, stdev: 0.23, p5: 0.84, p50: 1.12, p95: 1.56, probabilityOfLoss: 0.293 },
  },
  computedAt: "2026-07-30T21:35:03.411Z",
};

describe("PortfolioComparison", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a warming-up message, not an error, while the cache is empty (503)", async () => {
    stubFetchJson({ error: "not yet available" }, false, 503);
    render(<PortfolioComparison />);

    expect(await screen.findByText(/warming up/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the halal symbol list and both portfolios' summary stats once loaded", async () => {
    stubFetchJson(comparison);
    render(<PortfolioComparison />);

    expect(await screen.findByText(/AAPL, MSFT/)).toBeInTheDocument();
    // Expected value row: halal 120%, conventional 115%.
    expect(screen.getByText("120%")).toBeInTheDocument();
    expect(screen.getByText("115%")).toBeInTheDocument();
    // Probability of loss row.
    expect(screen.getByText("27%")).toBeInTheDocument();
    expect(screen.getByText("29%")).toBeInTheDocument();
  });

  it("renders an accessible chart with a text alternative", async () => {
    stubFetchJson(comparison);
    render(<PortfolioComparison />);

    expect(
      await screen.findByRole("img", { name: /fan chart comparing simulated halal and conventional/i }),
    ).toBeInTheDocument();
  });

  it("shows a real error message on a genuine failure (not 503)", async () => {
    stubFetchJson({}, false, 500);
    render(<PortfolioComparison />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/HTTP 500/);
  });

  it("always renders the summary table, not only behind hover interaction", async () => {
    stubFetchJson(comparison);
    render(<PortfolioComparison />);

    await screen.findByText(/AAPL, MSFT/);
    expect(screen.getByText("Expected value (1yr)")).toBeInTheDocument();
    expect(screen.getByText("Volatility (stdev)")).toBeInTheDocument();
    expect(screen.getByText("Probability of loss")).toBeInTheDocument();
    // Hover-only detail row should NOT be present without a hover event.
    expect(screen.queryByTestId("portfolio-comparison-hover")).not.toBeInTheDocument();
  });
});
