import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PurificationCalculator } from "../src/components/PurificationCalculator.js";
import type { PurificationResult } from "../src/lib/api.js";

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

const worked: PurificationResult = {
  symbol: "AAPL",
  dividendReceived: 500,
  nonCompliantIncomeRatio: 0.02,
  purificationAmount: 10,
  netAmount: 490,
};

describe("PurificationCalculator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("computes and displays the worked example ($500 at 2% -> $10 purified, $490 net)", async () => {
    stubFetchJson(worked);
    const user = userEvent.setup();
    render(<PurificationCalculator symbol="AAPL" />);

    await user.type(screen.getByLabelText("Dividend received ($)"), "500");
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    expect(await screen.findByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("$490.00")).toBeInTheDocument();
    expect(screen.getByText("2.00%")).toBeInTheDocument();
  });

  it("sends the entered amount as a number in the request body", async () => {
    stubFetchJson(worked);
    const user = userEvent.setup();
    render(<PurificationCalculator symbol="AAPL" />);

    await user.type(screen.getByLabelText("Dividend received ($)"), "500");
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await screen.findByText("$10.00");

    const fetchMock = vi.mocked(fetch);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/companies/AAPL/purification");
    expect(JSON.parse(options.body as string)).toEqual({ dividendReceived: 500 });
  });

  it("shows 'Unknown', not $0.00, when the ratio is unknown", async () => {
    stubFetchJson({ ...worked, nonCompliantIncomeRatio: null, purificationAmount: null, netAmount: null });
    const user = userEvent.setup();
    render(<PurificationCalculator symbol="AAPL" />);

    await user.type(screen.getByLabelText("Dividend received ($)"), "500");
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    const unknowns = await screen.findAllByText("Unknown");
    expect(unknowns).toHaveLength(3);
  });

  it("rejects a negative amount client-side, without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<PurificationCalculator symbol="AAPL" />);

    await user.type(screen.getByLabelText("Dividend received ($)"), "-50");
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("non-negative");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the server's error message when the request fails", async () => {
    stubFetchJson({ error: "unknown symbol: ZZZZ" }, false, 404);
    const user = userEvent.setup();
    render(<PurificationCalculator symbol="ZZZZ" />);

    await user.type(screen.getByLabelText("Dividend received ($)"), "100");
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("unknown symbol: ZZZZ");
  });
});
