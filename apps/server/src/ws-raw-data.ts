import type WebSocket from "ws";

/**
 * Decode a WebSocket frame to a UTF-8 string, handling every shape
 * `RawData` can take: a single Buffer, a fragmented Buffer[], or a raw
 * ArrayBuffer. A naive `.toString()` corrupts the latter two (see the
 * Phase 6 bug this fixed — `[object ArrayBuffer]` / comma-joined
 * fragments — caught by type-aware lint, not a manual test).
 */
export function rawDataToString(data: WebSocket.RawData): string {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}
