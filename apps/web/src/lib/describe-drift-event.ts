import { RATIO_LABELS } from "./reasons.js";
import type { DriftEventMessage } from "./realtime-events.js";

const STATUS_LABELS: Record<string, string> = {
  COMPLIANT: "Compliant",
  NON_COMPLIANT: "Non-compliant",
  UNKNOWN: "Unknown",
};

export function describeDriftEvent(event: DriftEventMessage): string {
  if (event.alertType === "VERDICT_FLIPPED") {
    return `${event.symbol} is now ${STATUS_LABELS[event.status] ?? event.status}`;
  }

  const label = event.ratio ? (RATIO_LABELS[event.ratio] ?? event.ratio) : "A ratio";
  const previous = event.previousValue !== null ? `${(event.previousValue * 100).toFixed(1)}%` : "?";
  const current = event.currentValue !== null ? `${(event.currentValue * 100).toFixed(1)}%` : "?";
  const threshold = event.threshold !== null ? `${(event.threshold * 100).toFixed(0)}%` : "?";

  return `${event.symbol}: ${label} crossed its ${threshold} threshold (${previous} → ${current})`;
}
