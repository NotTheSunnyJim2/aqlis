import type { VerdictStatus } from "./verdict.js";

export type RatioKind = "DEBT" | "CASH" | "RECEIVABLES" | "NON_COMPLIANT_INCOME";

/** Same thresholds as the screening engine — see financial-ratio-screen.ts
 * and non-compliant-income-screen.ts for the cited source. */
const RATIO_THRESHOLDS: Record<RatioKind, number> = {
  DEBT: 0.33,
  CASH: 0.33,
  RECEIVABLES: 0.33,
  NON_COMPLIANT_INCOME: 0.05,
};

/** The minimal shape drift comparison needs — satisfied by both a
 * freshly-computed Verdict and a ComplianceVerdict row read back from
 * Postgres. */
export interface DriftComparableVerdict {
  status: VerdictStatus;
  debtRatio: number | null;
  cashRatio: number | null;
  receivablesRatio: number | null;
  nonCompliantIncomeRatio: number | null;
}

export interface DriftEvent {
  type: "VERDICT_FLIPPED" | "RATIO_THRESHOLD_CROSSED";
  /** Set only for RATIO_THRESHOLD_CROSSED. */
  ratio: RatioKind | null;
  previousValue: number | null;
  currentValue: number | null;
  threshold: number | null;
}

/**
 * Compares two consecutive verdicts for the SAME company and returns
 * every drift event between them.
 *
 * `previous === null` means this is the company's first-ever verdict —
 * there's nothing to have drifted FROM, so no events are produced
 * (never a spurious "flip" on a company's very first check).
 *
 * A ratio only counts as "crossed" if it changed which SIDE of its
 * threshold it's on — moving from 0.10 to 0.15 isn't a crossing (both
 * comfortably under 0.33); moving from 0.30 to 0.35 is, in EITHER
 * direction (compliance lost or regained). A ratio missing on either
 * side (null) is skipped — "crossed" isn't claimable without knowing
 * both endpoints.
 */
export function detectDrift(
  previous: DriftComparableVerdict | null,
  current: DriftComparableVerdict,
): DriftEvent[] {
  if (previous === null) {
    return [];
  }

  const events: DriftEvent[] = [];

  if (previous.status !== current.status) {
    events.push({ type: "VERDICT_FLIPPED", ratio: null, previousValue: null, currentValue: null, threshold: null });
  }

  const ratioPairs: [RatioKind, number | null, number | null][] = [
    ["DEBT", previous.debtRatio, current.debtRatio],
    ["CASH", previous.cashRatio, current.cashRatio],
    ["RECEIVABLES", previous.receivablesRatio, current.receivablesRatio],
    [
      "NON_COMPLIANT_INCOME",
      previous.nonCompliantIncomeRatio,
      current.nonCompliantIncomeRatio,
    ],
  ];

  for (const [ratio, previousValue, currentValue] of ratioPairs) {
    if (previousValue === null || currentValue === null) {
      continue;
    }
    const threshold = RATIO_THRESHOLDS[ratio];
    const wasUnder = previousValue < threshold;
    const isUnder = currentValue < threshold;
    if (wasUnder !== isUnder) {
      events.push({ type: "RATIO_THRESHOLD_CROSSED", ratio, previousValue, currentValue, threshold });
    }
  }

  return events;
}
