import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// The `ws` package's WebSocket, NOT Node's global ambient WebSocket —
// FinnhubPriceClientOptions.WebSocketImpl is typed against THIS one
// (finnhub-client.ts imports it the same way), and the two are
// different nominal types even though both are named "WebSocket".
import type WebSocket from "ws";
import { FinnhubPriceClient } from "../src/ingestion/finnhub-client.js";
import { FakeWs, resetFakeWs } from "./helpers/fake-ws.js";

const noop = (): void => undefined;
const silentLogger = { info: noop, warn: noop, error: noop, debug: noop };

function buildClient(overrides: Record<string, unknown> = {}): FinnhubPriceClient {
  return new FinnhubPriceClient({
    apiKey: "test-key",
    symbols: ["AAPL"],
    onTrade: noop,
    logger: silentLogger,
    WebSocketImpl: FakeWs as unknown as typeof WebSocket,
    backoffBaseMs: 100,
    backoffMaxMs: 800,
    heartbeatIntervalMs: 1000,
    ...overrides,
  });
}

describe("FinnhubPriceClient reconnect/heartbeat (deferred item ⑦)", () => {
  beforeEach(() => {
    resetFakeWs();
    vi.useFakeTimers();
    // Deterministic jitter: Math.random() -> 1 makes the scheduled delay
    // equal exactly the capped value (Math.floor(1 * capped) === capped),
    // so exponential growth is assertable with exact numbers.
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("schedules a reconnect with exponentially growing delay, capped at backoffMaxMs", () => {
    const client = buildClient();
    client.start();
    expect(FakeWs.instances).toHaveLength(1);

    // attempt 0: capped = 100 * 2^0 = 100
    FakeWs.instances[0]?.emit("close");
    vi.advanceTimersByTime(99);
    expect(FakeWs.instances).toHaveLength(1); // not yet
    vi.advanceTimersByTime(1);
    expect(FakeWs.instances).toHaveLength(2); // reconnected at 100ms

    // attempt 1: capped = 100 * 2^1 = 200
    FakeWs.instances[1]?.emit("close");
    vi.advanceTimersByTime(199);
    expect(FakeWs.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWs.instances).toHaveLength(3);

    // attempt 2: capped = 100 * 2^2 = 400
    FakeWs.instances[2]?.emit("close");
    vi.advanceTimersByTime(400);
    expect(FakeWs.instances).toHaveLength(4);

    // attempt 3: capped = 100 * 2^3 = 800 (== max, no further growth)
    FakeWs.instances[3]?.emit("close");
    vi.advanceTimersByTime(800);
    expect(FakeWs.instances).toHaveLength(5);

    // attempt 4: would be 1600 uncapped, but capped at backoffMaxMs = 800
    FakeWs.instances[4]?.emit("close");
    vi.advanceTimersByTime(800);
    expect(FakeWs.instances).toHaveLength(6);
  });

  it("resets the backoff to the base delay after a successful connection", () => {
    const client = buildClient();
    client.start();

    // Two failed attempts grow the backoff: 100ms, then 200ms.
    FakeWs.instances[0]?.emit("close");
    vi.advanceTimersByTime(100);
    FakeWs.instances[1]?.emit("close");
    vi.advanceTimersByTime(200);
    expect(FakeWs.instances).toHaveLength(3);

    // This connection succeeds — resets reconnectAttempts to 0.
    FakeWs.instances[2]?.emit("open");
    FakeWs.instances[2]?.emit("close");

    // Next reconnect should use the BASE delay again (100ms), not 400ms.
    vi.advanceTimersByTime(99);
    expect(FakeWs.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(FakeWs.instances).toHaveLength(4);
  });

  it("does not reconnect after stop() is called", () => {
    const client = buildClient();
    client.start();
    client.stop();

    FakeWs.instances[0]?.emit("close");
    vi.advanceTimersByTime(10_000);

    expect(FakeWs.instances).toHaveLength(1); // no reconnect attempted
  });

  it("pings on the heartbeat interval once connected", () => {
    const client = buildClient();
    client.start();
    FakeWs.instances[0]?.emit("open");

    vi.advanceTimersByTime(1000);
    expect(FakeWs.instances[0]?.pingCount).toBe(1);

    FakeWs.instances[0]?.emit("pong"); // reply, so the next tick doesn't kill it
    vi.advanceTimersByTime(1000);
    expect(FakeWs.instances[0]?.pingCount).toBe(2);
  });

  it("terminates a connection that misses a heartbeat pong (the half-open case)", () => {
    const client = buildClient();
    client.start();
    FakeWs.instances[0]?.emit("open");

    vi.advanceTimersByTime(1000); // first ping sent
    // No pong reply simulated — connection is silently dead.
    vi.advanceTimersByTime(1000); // second tick: still not alive -> terminate

    expect(FakeWs.instances[0]?.terminated).toBe(true);
  });

  it("keeps a connection alive that replies to every heartbeat", () => {
    const client = buildClient();
    client.start();
    FakeWs.instances[0]?.emit("open");

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000);
      FakeWs.instances[0]?.emit("pong");
    }

    expect(FakeWs.instances[0]?.terminated).toBe(false);
  });
});
