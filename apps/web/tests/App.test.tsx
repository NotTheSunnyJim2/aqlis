import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App.js";
import { FakeWebSocket, resetFakeWebSocket } from "./helpers/fake-websocket.js";

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without crashing and shows the app name", async () => {
    // App renders StockList (fetches /api/companies), PortfolioComparison
    // (fetches /api/monte-carlo), and DriftAlertFeed (opens a WebSocket)
    // on mount — all three need a response shaped for THEIR OWN endpoint,
    // not one blanket body, or PortfolioComparison crashes on the later
    // re-render once its fetch resolves with the wrong shape (a real bug
    // caught here: the crash happens in a microtask after this test's
    // synchronous assertions already ran, so it wouldn't fail the test
    // without explicitly awaiting past that point — see the extra
    // findByText below, which forces the test to actually wait for it).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/monte-carlo")) {
          return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ companies: [] }) });
      }),
    );
    resetFakeWebSocket();
    vi.stubGlobal("WebSocket", FakeWebSocket);

    render(<App />);
    expect(screen.getByText("Aqlis")).toBeInTheDocument();
    // Forces the test to wait past PortfolioComparison's fetch resolving.
    expect(await screen.findByText(/warming up/i)).toBeInTheDocument();
  });
});
