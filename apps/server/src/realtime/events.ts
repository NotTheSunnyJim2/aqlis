import type { RatioKind } from "../screening/drift.js";
import type { VerdictStatus } from "../screening/verdict.js";

/** The Redis Pub/Sub channel every dashboard event is published to. */
export const REALTIME_CHANNEL = "aqlis:events";

export interface PriceEvent {
  type: "price";
  symbol: string;
  /** Kept as a string end-to-end — same precision reasoning as the
   * ingestion pipeline (see consumers/price-entry.ts). */
  price: string;
  observedAt: string;
}

export interface DriftEventMessage {
  type: "drift";
  symbol: string;
  alertType: "VERDICT_FLIPPED" | "RATIO_THRESHOLD_CROSSED";
  ratio: RatioKind | null;
  previousValue: number | null;
  currentValue: number | null;
  threshold: number | null;
  /** The company's status AFTER this event — what the badge should show. */
  status: VerdictStatus;
}

export type RealtimeEvent = PriceEvent | DriftEventMessage;
