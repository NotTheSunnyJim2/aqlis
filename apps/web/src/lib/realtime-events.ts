/**
 * Mirrors apps/server/src/realtime/events.ts. Duplicated rather than
 * shared — same trade-off already accepted for CompanySummary and
 * VerdictDetail (api.ts): this monorepo has no shared-types package,
 * and introducing one now is a bigger refactor than this feature
 * warrants. Acknowledged, not silent.
 */

export interface PriceEvent {
  type: "price";
  symbol: string;
  price: string;
  observedAt: string;
}

export interface DriftEventMessage {
  type: "drift";
  symbol: string;
  alertType: "VERDICT_FLIPPED" | "RATIO_THRESHOLD_CROSSED";
  ratio: "DEBT" | "CASH" | "RECEIVABLES" | "NON_COMPLIANT_INCOME" | null;
  previousValue: number | null;
  currentValue: number | null;
  threshold: number | null;
  status: "COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN";
}

export type RealtimeEvent = PriceEvent | DriftEventMessage;
