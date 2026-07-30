import type { Redis } from "ioredis";
import { REALTIME_CHANNEL, type RealtimeEvent } from "./events.js";

/**
 * Publishes one event to connected dashboard clients (via the API
 * server's subscriber — see index.ts). Unlike XADD to a Stream, PUBLISH
 * needs no dedicated connection and nothing is persisted: if no one is
 * subscribed right now, the event is simply gone — the correct
 * semantics for a live UI update (see realtime/events.ts).
 */
export function publishEvent(redis: Redis, event: RealtimeEvent): Promise<number> {
  return redis.publish(REALTIME_CHANNEL, JSON.stringify(event));
}
