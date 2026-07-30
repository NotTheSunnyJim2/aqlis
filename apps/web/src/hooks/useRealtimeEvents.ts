import { useEffect, useState } from "react";
import type { RealtimeEvent } from "../lib/realtime-events.js";

const MAX_EVENTS = 50;
const RECONNECT_DELAY_MS = 3000;

/** A received event, tagged with a stable client-side id — array index
 * isn't a valid React key here since new events PREPEND, which shifts
 * every existing item's index (correctness issue for reconciliation,
 * not just a lint nag). */
export type TimestampedEvent = RealtimeEvent & { id: number };

export interface UseRealtimeEventsResult {
  events: TimestampedEvent[];
  connected: boolean;
}

function defaultUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Connects to the dashboard's live feed (Phase 12) and accumulates
 * incoming events, newest first, capped at MAX_EVENTS so a long-open
 * tab doesn't grow the array unboundedly.
 *
 * Reconnects on a fixed delay after any close — simpler than the
 * server-side exponential-backoff-with-jitter pattern (FinnhubPriceClient,
 * Phase 6): a browser tab isn't at risk of hammering a genuinely-down
 * server the way a long-running server process retrying forever would
 * be, so the added complexity isn't justified here.
 *
 * `WebSocketImpl` is injectable (defaults to the browser's real
 * WebSocket) so tests can pass a structural fake instead of stubbing
 * a global — same DI pattern as the server's injectable `fetchImpl`.
 */
export function useRealtimeEvents(
  WebSocketImpl: typeof WebSocket = WebSocket,
  url: string = defaultUrl(),
): UseRealtimeEventsResult {
  const [events, setEvents] = useState<TimestampedEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let nextId = 0;

    function connect(): void {
      socket = new WebSocketImpl(url);

      socket.onopen = () => {
        setConnected(true);
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeEvent;
          nextId += 1;
          const tagged: TimestampedEvent = { ...parsed, id: nextId };
          setEvents((prev) => [tagged, ...prev].slice(0, MAX_EVENTS));
        } catch {
          // Malformed message: drop it silently rather than crash the
          // feed — a bad frame shouldn't take down the whole dashboard.
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- WebSocketImpl/url are effectively constant per mount; re-running on their identity would just reconnect for no reason
  }, []);

  return { events, connected };
}
