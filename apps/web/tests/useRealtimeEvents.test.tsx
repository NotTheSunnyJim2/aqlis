import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRealtimeEvents } from "../src/hooks/useRealtimeEvents.js";
import { FakeWebSocket, resetFakeWebSocket } from "./helpers/fake-websocket.js";
import type { RealtimeEvent } from "../src/lib/realtime-events.js";

const priceEvent: RealtimeEvent = {
  type: "price",
  symbol: "AAPL",
  price: "196",
  observedAt: "1720621800123",
};

describe("useRealtimeEvents", () => {
  beforeEach(() => {
    resetFakeWebSocket();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is disconnected until the socket opens", () => {
    const { result } = renderHook(() =>
      useRealtimeEvents(FakeWebSocket as unknown as typeof WebSocket, "ws://test/ws"),
    );
    expect(result.current.connected).toBe(false);

    act(() => {
      FakeWebSocket.instances[0]?.simulateOpen();
    });
    expect(result.current.connected).toBe(true);
  });

  it("accumulates incoming events, newest first", () => {
    const { result } = renderHook(() =>
      useRealtimeEvents(FakeWebSocket as unknown as typeof WebSocket, "ws://test/ws"),
    );
    const socket = FakeWebSocket.instances[0];

    act(() => {
      socket?.simulateMessage(priceEvent);
      socket?.simulateMessage({ ...priceEvent, price: "197" });
    });

    expect(result.current.events).toHaveLength(2);
    expect(result.current.events[0]).toMatchObject({ price: "197" });
    expect(result.current.events[1]).toMatchObject({ price: "196" });
  });

  it("assigns each event a stable, unique id", () => {
    const { result } = renderHook(() =>
      useRealtimeEvents(FakeWebSocket as unknown as typeof WebSocket, "ws://test/ws"),
    );
    const socket = FakeWebSocket.instances[0];

    act(() => {
      socket?.simulateMessage(priceEvent);
      socket?.simulateMessage(priceEvent);
    });

    const ids = result.current.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("caps the event list at 50, dropping the oldest", () => {
    const { result } = renderHook(() =>
      useRealtimeEvents(FakeWebSocket as unknown as typeof WebSocket, "ws://test/ws"),
    );
    const socket = FakeWebSocket.instances[0];

    act(() => {
      for (let i = 0; i < 55; i++) {
        socket?.simulateMessage({ ...priceEvent, price: String(i) });
      }
    });

    expect(result.current.events).toHaveLength(50);
    expect(result.current.events[0]).toMatchObject({ price: "54" }); // newest
  });

  it("drops an unparseable message instead of crashing", () => {
    const { result } = renderHook(() =>
      useRealtimeEvents(FakeWebSocket as unknown as typeof WebSocket, "ws://test/ws"),
    );
    const socket = FakeWebSocket.instances[0];

    act(() => {
      socket?.onmessage?.({ data: "not json{" });
    });

    expect(result.current.events).toHaveLength(0);
  });

  it("reconnects a fixed delay after the socket closes", () => {
    renderHook(() =>
      useRealtimeEvents(FakeWebSocket as unknown as typeof WebSocket, "ws://test/ws"),
    );
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => {
      FakeWebSocket.instances[0]?.simulateClose();
    });
    expect(FakeWebSocket.instances).toHaveLength(1); // not yet — waiting on the delay

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2); // reconnected
  });

  it("does not reconnect after the component unmounts", () => {
    const { unmount } = renderHook(() =>
      useRealtimeEvents(FakeWebSocket as unknown as typeof WebSocket, "ws://test/ws"),
    );
    const socket = FakeWebSocket.instances[0];

    unmount();
    expect(socket?.closed).toBe(true);

    act(() => {
      socket?.simulateClose();
      vi.advanceTimersByTime(5000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1); // no reconnect attempted
  });
});
