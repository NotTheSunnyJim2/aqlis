import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { DriftAlertFeed } from "../src/components/DriftAlertFeed.js";
import { FakeWebSocket, resetFakeWebSocket } from "./helpers/fake-websocket.js";
import type { RealtimeEvent } from "../src/lib/realtime-events.js";

const priceEvent: RealtimeEvent = {
  type: "price",
  symbol: "AAPL",
  price: "196",
  observedAt: "1720621800123",
};

const driftEvent: RealtimeEvent = {
  type: "drift",
  symbol: "T",
  alertType: "VERDICT_FLIPPED",
  ratio: null,
  previousValue: null,
  currentValue: null,
  threshold: null,
  status: "NON_COMPLIANT",
};

describe("DriftAlertFeed", () => {
  beforeEach(() => {
    resetFakeWebSocket();
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a waiting message and 'Reconnecting…' before the socket opens", () => {
    render(<DriftAlertFeed />);
    expect(screen.getByText(/No alerts yet/)).toBeInTheDocument();
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
  });

  it("shows 'Live' once connected", () => {
    render(<DriftAlertFeed />);
    act(() => {
      FakeWebSocket.instances[0]?.simulateOpen();
    });
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders a drift event but filters out price events", () => {
    render(<DriftAlertFeed />);
    const socket = FakeWebSocket.instances[0];

    act(() => {
      socket?.simulateMessage(priceEvent);
      socket?.simulateMessage(driftEvent);
    });

    expect(screen.getByText("T is now Non-compliant")).toBeInTheDocument();
    expect(screen.queryByText(/AAPL/)).not.toBeInTheDocument();
  });
});
