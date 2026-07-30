import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { ConnectionHub } from "../src/realtime/connection-hub.js";
import type { RealtimeEvent } from "../src/realtime/events.js";
import { rawDataToString } from "../src/ws-raw-data.js";

const noop = (): void => undefined;

/**
 * Drives the REAL /ws route with a real `ws` client over a real
 * ephemeral-port socket — the server-side mirror of Phase 6's
 * finnhub-client.integration.test.ts. Proves the whole chain: HTTP
 * upgrade -> route -> ConnectionHub.add() -> (here, a direct
 * hub.broadcast() standing in for index.ts's Redis subscriber) ->
 * bytes actually received by a real client.
 */
describe("/ws (integration)", () => {
  let app: FastifyInstance | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.close();
    await app?.close();
    app = undefined;
    client = undefined;
  });

  it("delivers a broadcast event to a connected client", async () => {
    const hub = new ConnectionHub({ info: noop, warn: noop, error: noop, debug: noop });
    app = await buildApp({ logger: false, connectionHub: hub });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;

    const event: RealtimeEvent = {
      type: "price",
      symbol: "AAPL",
      price: "196",
      observedAt: "1720621800123",
    };

    const received = await new Promise<RealtimeEvent>((resolve) => {
      client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      client.on("open", () => {
        // Broadcast only once the client is actually connected — the
        // hub has no queue, matching the ephemeral Pub/Sub semantics
        // this route exists to serve (see realtime/publisher.ts).
        hub.broadcast(event);
      });
      client.on("message", (raw) => {
        resolve(JSON.parse(rawDataToString(raw)) as RealtimeEvent);
      });
    });

    expect(received).toEqual(event);
    expect(hub.size).toBe(1);
  });
});
