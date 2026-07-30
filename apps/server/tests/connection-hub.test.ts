import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import type { Logger } from "../src/logger.js";
import { ConnectionHub } from "../src/realtime/connection-hub.js";
import type { RealtimeEvent } from "../src/realtime/events.js";

const noop = (): void => undefined;
const silentLogger: Logger = { info: noop, warn: noop, error: noop, debug: noop };

/** Structural fake: only the ws.WebSocket surface ConnectionHub touches. */
class FakeSocket {
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState: number = this.OPEN;
  sent: string[] = [];
  terminated = false;
  private readonly handlers = new Map<string, (() => void)[]>();

  on(event: string, handler: () => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  ping(): void {
    // no-op in the fake; the real ws lib would trigger a pong via the network
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Test helper: simulate the real client replying to a ping. */
  emitPong(): void {
    for (const handler of this.handlers.get("pong") ?? []) handler();
  }

  /** Test helper: simulate a disconnect. */
  emitClose(): void {
    for (const handler of this.handlers.get("close") ?? []) handler();
  }
}

const asSocket = (fake: FakeSocket): WebSocket => fake as unknown as WebSocket;

const priceEvent: RealtimeEvent = {
  type: "price",
  symbol: "AAPL",
  price: "196",
  observedAt: "1720621800123",
};

describe("ConnectionHub", () => {
  it("adds a client and broadcasts to it", () => {
    const hub = new ConnectionHub(silentLogger);
    const socket = new FakeSocket();
    hub.add(asSocket(socket));

    expect(hub.size).toBe(1);
    hub.broadcast(priceEvent);

    expect(socket.sent).toEqual([JSON.stringify(priceEvent)]);
  });

  it("broadcasts to every connected client, not just the first", () => {
    const hub = new ConnectionHub(silentLogger);
    const a = new FakeSocket();
    const b = new FakeSocket();
    hub.add(asSocket(a));
    hub.add(asSocket(b));

    hub.broadcast(priceEvent);

    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
  });

  it("skips a socket that isn't OPEN (e.g. mid-close)", () => {
    const hub = new ConnectionHub(silentLogger);
    const socket = new FakeSocket();
    hub.add(asSocket(socket));
    socket.readyState = socket.CLOSED;

    hub.broadcast(priceEvent);

    expect(socket.sent).toHaveLength(0);
  });

  it("removes a client on close and stops counting it", () => {
    const hub = new ConnectionHub(silentLogger);
    const socket = new FakeSocket();
    hub.add(asSocket(socket));

    socket.emitClose();

    expect(hub.size).toBe(0);
  });

  describe("heartbeat", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("terminates a client that never responds to a ping", () => {
      const hub = new ConnectionHub(silentLogger, 1000);
      const socket = new FakeSocket();
      hub.add(asSocket(socket));
      hub.startHeartbeat();

      vi.advanceTimersByTime(1000); // first tick: pings, marks not-alive
      expect(socket.terminated).toBe(false);

      vi.advanceTimersByTime(1000); // second tick: never got a pong -> terminate
      expect(socket.terminated).toBe(true);
      expect(hub.size).toBe(0);

      hub.stopHeartbeat();
    });

    it("keeps a client alive that DOES respond with a pong", () => {
      const hub = new ConnectionHub(silentLogger, 1000);
      const socket = new FakeSocket();
      hub.add(asSocket(socket));
      hub.startHeartbeat();

      vi.advanceTimersByTime(1000); // first tick: pings
      socket.emitPong(); // client replies before the next tick
      vi.advanceTimersByTime(1000); // second tick: was alive, pings again

      expect(socket.terminated).toBe(false);
      expect(hub.size).toBe(1);

      hub.stopHeartbeat();
    });
  });
});
