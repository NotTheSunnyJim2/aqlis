import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App.js";

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without crashing and shows the app name", () => {
    // App renders StockList, which fetches on mount — stub it so this
    // smoke test doesn't depend on real network/timing.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ companies: [] }),
      }),
    );
    render(<App />);
    expect(screen.getByText("Aqlis")).toBeInTheDocument();
  });
});
