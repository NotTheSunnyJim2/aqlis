import type { CompanySummary } from "../lib/api.js";

/**
 * Four visual states, not three — `null` (no verdict has ever been
 * computed, e.g. before the first worker run) is deliberately distinct
 * from a computed `UNKNOWN` verdict (the screening engine ran but
 * couldn't determine compliance due to missing data, Phase 9). Same
 * "missing != a specific value" discipline as the rest of the
 * codebase, now visible in the UI.
 */
const CONFIG = {
  COMPLIANT: {
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    label: "Compliant",
  },
  NON_COMPLIANT: {
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    label: "Non-compliant",
  },
  UNKNOWN: {
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    label: "Unknown",
  },
  PENDING: {
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    label: "Pending",
  },
} as const;

export function ComplianceBadge({ status }: { status: CompanySummary["status"] }) {
  const { className, label } = CONFIG[status ?? "PENDING"];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
