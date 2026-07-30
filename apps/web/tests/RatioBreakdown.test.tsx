import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatioBreakdown } from "../src/components/RatioBreakdown.js";
import type { VerdictDetail } from "../src/lib/api.js";

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

// Real Phase 9/10 AT&T figures: permissible business, disqualified
// purely by its debt ratio (96.39% against a 33% threshold).
const tVerdict: VerdictDetail = {
  symbol: "T",
  status: "NON_COMPLIANT",
  businessActivityPass: true,
  marketCap: "168996180000",
  debtRatio: 0.9639,
  cashRatio: 0.103967,
  receivablesRatio: 0.050421,
  nonCompliantIncomeRatio: 0,
  reasons: ["RATIO_EXCEEDED:DEBT"],
  computedAt: "2026-07-29T18:38:18.539Z",
};

describe("RatioBreakdown", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading state before the fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    render(<RatioBreakdown symbol="T" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders T's real debt-ratio failure with its threshold and reason", async () => {
    stubFetchJson(tVerdict);
    render(<RatioBreakdown symbol="T" />);

    expect(await screen.findByText("Non-compliant")).toBeInTheDocument();
    expect(screen.getByText("96.39%", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Debt ratio exceeds its threshold")).toBeInTheDocument();
    // The business itself is fine — only the financing fails.
    expect(screen.getByText("Passes")).toBeInTheDocument();
  });

  it("shows 'Unknown' for a ratio that's null rather than rendering 0%", async () => {
    stubFetchJson({ ...tVerdict, cashRatio: null });
    render(<RatioBreakdown symbol="T" />);

    await screen.findByText("Non-compliant");
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows a message, not a crash, when no verdict has ever been computed", async () => {
    stubFetchJson(null);
    render(<RatioBreakdown symbol="ZZZZ" />);

    expect(await screen.findByText(/No verdict has been computed/)).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    stubFetchJson({}, false, 500);
    render(<RatioBreakdown symbol="T" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to load verdict");
  });
});
