import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { FinnhubPriceClient, type Logger } from "../src/ingestion/finnhub-client.js";
import type { FinnhubTrade } from "../src/ingestion/finnhub-message.js";

const noop = (): void => undefined;
const silentLogger: Logger = { info: noop, warn: noop, error: noop, debug: noop };

/**
 * Drives the real client against a local WebSocket server standing in
 * for Finnhub — verifying the connect -> subscribe -> parse -> onTrade
 * contract in-process (no external network, safe in CI).
 *
 * Reconnection/heartbeat timing is left to the Phase 14 testing pass
 * (needs fake timers); this covers the happy-path data contract.
 */
describe("FinnhubPriceClient (integration)", () => {
  let server: WebSocketServer;
  let client: FinnhubPriceClient | undefined;
  let url: string;

  beforeEach(async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    url = `ws://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    client?.stop();
    client = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("subscribes and delivers a parsed trade to onTrade", async () => {
    // Stand-in Finnhub: on a subscribe message, reply with one trade.
    server.on("connection", (socket) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse((raw as Buffer).toString("utf8")) as {
          type?: string;
          symbol?: string;
        };
        if (msg.type === "subscribe" && msg.symbol) {
          socket.send(
            JSON.stringify({
              type: "trade",
              data: [{ s: msg.symbol, p: 195.2, t: 1720621800123 }],
            }),
          );
        }
      });
    });

    const received = await new Promise<FinnhubTrade>((resolve) => {
      client = new FinnhubPriceClient({
        apiKey: "test-token",
        symbols: ["AAPL"],
        logger: silentLogger,
        url,
        onTrade: resolve,
      });
      client.start();
    });

    expect(received).toEqual({
      symbol: "AAPL",
      price: 195.2,
      timestampMs: 1720621800123,
    });
  });
});
