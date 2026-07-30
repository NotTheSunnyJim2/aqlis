import { useRealtimeEvents, type TimestampedEvent } from "../hooks/useRealtimeEvents.js";
import { describeDriftEvent } from "../lib/describe-drift-event.js";
import type { DriftEventMessage } from "../lib/realtime-events.js";

function isDriftEvent(event: TimestampedEvent): event is TimestampedEvent & DriftEventMessage {
  return event.type === "drift";
}

/** Left-border color: green for a recovery/compliant outcome, red for
 * a breach/non-compliant outcome — same color vocabulary as
 * ComplianceBadge, applied to the event that CAUSED the change. */
function alertAccentClass(event: DriftEventMessage): string {
  if (event.alertType === "VERDICT_FLIPPED") {
    if (event.status === "COMPLIANT") return "border-l-emerald-500";
    if (event.status === "NON_COMPLIANT") return "border-l-red-500";
    return "border-l-amber-500";
  }
  if (event.currentValue !== null && event.threshold !== null) {
    return event.currentValue < event.threshold ? "border-l-emerald-500" : "border-l-red-500";
  }
  return "border-l-slate-400";
}

export function DriftAlertFeed() {
  const { events, connected } = useRealtimeEvents();
  const driftEvents = events.filter(isDriftEvent);

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Live compliance alerts
        </h2>
        <span
          className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-400"}`}
          aria-hidden="true"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </div>

      {driftEvents.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No alerts yet — watching for compliance changes…
        </p>
      ) : (
        <ul className="space-y-2">
          {driftEvents.map((event) => (
            <li
              key={event.id}
              className={`border-l-4 py-1 pl-3 text-sm text-slate-700 dark:text-slate-300 ${alertAccentClass(event)}`}
            >
              {describeDriftEvent(event)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
