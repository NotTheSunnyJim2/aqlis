import WebSocket from "ws";
import { parseTradeMessage, type FinnhubTrade } from "./finnhub-message.js";
import type { Logger } from "../logger.js";
import { rawDataToString } from "../ws-raw-data.js";

export type { Logger };

const DEFAULT_URL = "wss://ws.finnhub.io";
const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_BACKOFF_BASE_MS = 1_000;
const DEFAULT_BACKOFF_MAX_MS = 30_000;

export interface FinnhubPriceClientOptions {
  apiKey: string;
  symbols: string[];
  onTrade: (trade: FinnhubTrade) => void;
  logger: Logger;
  /** Override the endpoint (integration tests point this at a local server). */
  url?: string;
  heartbeatIntervalMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

/**
 * Resilient Finnhub trade-stream client built on raw `ws`.
 *
 * Raw WebSocket gives us no safety net, so we own three things that a
 * higher-level library would hide:
 *   1. Reconnection with exponential backoff + full jitter.
 *   2. A heartbeat to detect silently-dead ("half-open") connections.
 *   3. Clean lifecycle: stop() must not trigger a reconnect.
 */
export class FinnhubPriceClient {
  private ws?: WebSocket;
  private stopped = false;
  private reconnectAttempts = 0;
  private isAlive = false;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly options: FinnhubPriceClientOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  /** Stop for good: no further reconnects, timers cleared, socket closed. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = undefined;
  }

  private connect(): void {
    const base = this.options.url ?? DEFAULT_URL;
    const ws = new WebSocket(`${base}?token=${this.options.apiKey}`);
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempts = 0; // a good connection resets the backoff
      this.isAlive = true;
      this.subscribeAll();
      this.startHeartbeat();
      this.options.logger.info(
        { symbols: this.options.symbols.length },
        "finnhub connected",
      );
    });

    ws.on("message", (data: WebSocket.RawData) => {
      this.handleMessage(rawDataToString(data));
    });

    // Protocol-level pong (reply to our ping) proves the socket is live.
    ws.on("pong", () => {
      this.isAlive = true;
    });

    ws.on("error", (err: Error) => {
      // 'error' is always followed by 'close'; reconnect happens there.
      this.options.logger.warn({ err: err.message }, "finnhub socket error");
    });

    ws.on("close", () => {
      this.clearHeartbeat();
      if (this.stopped) {
        return;
      }
      this.scheduleReconnect();
    });
  }

  private subscribeAll(): void {
    for (const symbol of this.options.symbols) {
      this.ws?.send(JSON.stringify({ type: "subscribe", symbol }));
    }
  }

  private handleMessage(raw: string): void {
    let trades: FinnhubTrade[];
    try {
      trades = parseTradeMessage(raw);
    } catch (err) {
      this.options.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "unparseable finnhub message",
      );
      return;
    }
    for (const trade of trades) {
      this.options.onTrade(trade);
    }
  }

  /**
   * Half-open TCP connections die without a 'close' event — the socket
   * just goes silent. We ping on an interval; if a ping fires before the
   * previous one was answered (isAlive still false), the connection is
   * dead and we forcibly terminate it, which triggers 'close' -> reconnect.
   */
  private startHeartbeat(): void {
    this.clearHeartbeat();
    const interval = this.options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws) {
        return;
      }
      if (!this.isAlive) {
        this.clearHeartbeat();
        this.options.logger.warn({}, "finnhub heartbeat missed — terminating");
        this.ws.terminate(); // force-close a dead socket; close() would hang
        return;
      }
      this.isAlive = false;
      this.ws.ping();
    }, interval);
  }

  private scheduleReconnect(): void {
    const base = this.options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    const max = this.options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
    // Exponential backoff capped at max, then "full jitter": a random
    // delay in [0, capped] spreads reconnections and avoids a stampede.
    const capped = Math.min(max, base * 2 ** this.reconnectAttempts);
    const delay = Math.floor(Math.random() * capped);
    this.reconnectAttempts += 1;

    this.options.logger.info(
      { delayMs: delay, attempt: this.reconnectAttempts },
      "finnhub reconnecting",
    );
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
