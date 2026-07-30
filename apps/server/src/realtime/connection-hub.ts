import type WebSocket from "ws";
import type { Logger } from "../logger.js";
import type { RealtimeEvent } from "./events.js";

const DEFAULT_HEARTBEAT_MS = 30_000;

/** A `ws.WebSocket` tagged with its own liveness flag — the documented
 * `ws` pattern for heartbeating N connections with one shared timer. */
type TrackedSocket = WebSocket & { isAlive?: boolean };

/**
 * Tracks every connected dashboard client and broadcasts events to all
 * of them.
 *
 * This is the SERVER-side mirror of FinnhubPriceClient's heartbeat
 * (Phase 6) — same half-open-connection problem (a dead TCP connection
 * can go silent with no 'close' event), same ping/pong fix — but
 * shaped differently: that client managed ONE outbound connection's
 * liveness with instance fields; this manages MANY inbound
 * connections, so each socket carries its own `isAlive` flag and one
 * shared interval sweeps the whole set.
 */
export class ConnectionHub {
  private readonly clients = new Set<TrackedSocket>();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    private readonly logger: Logger,
    private readonly heartbeatIntervalMs: number = DEFAULT_HEARTBEAT_MS,
  ) {}

  add(socket: WebSocket): void {
    const tracked = socket as TrackedSocket;
    tracked.isAlive = true;
    this.clients.add(tracked);
    this.logger.info({ count: this.clients.size }, "dashboard client connected");

    tracked.on("pong", () => {
      tracked.isAlive = true;
    });
    tracked.on("close", () => {
      this.clients.delete(tracked);
      this.logger.info({ count: this.clients.size }, "dashboard client disconnected");
    });
  }

  broadcast(event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.clients) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const socket of this.clients) {
        if (socket.isAlive === false) {
          this.clients.delete(socket);
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  get size(): number {
    return this.clients.size;
  }
}
