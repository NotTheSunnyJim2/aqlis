import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App.js";
import { FakeWebSocket, resetFakeWebSocket } from "./helpers/fake-websocket.js";

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without crashing and shows the app name", () => {
    // App renders StockList (fetches on mount) and DriftAlertFeed (opens
    // a WebSocket on mount) — stub both so this smoke test doesn't
    // depend on real network/timing.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ companies: [] }),
      }),
    );
    resetFakeWebSocket();
    vi.stubGlobal("WebSocket", FakeWebSocket);

    render(<App />);
    expect(screen.getByText("Aqlis")).toBeInTheDocument();
  });
});
