/**
 * Income purification (NOT zakat — see README/ADR for the distinction).
 *
 * A stock can pass the Phase 9 screen while still deriving a small,
 * tolerated fraction of income from impermissible sources (almost
 * always interest on cash — see non-compliant-income-screen.ts). That
 * tolerance is for SCREENING purposes only; the same fraction of any
 * dividend received is considered tainted and should be donated to
 * charity, not kept.
 *
 * purificationAmount = dividendReceived × nonCompliantIncomeRatio
 */

export interface PurificationInput {
  dividendReceived: number;
  /** The company's current non-compliant income ratio (Phase 9),
   * null if genuinely unknown — never assume 0. */
  nonCompliantIncomeRatio: number | null;
}

export interface PurificationResult {
  dividendReceived: number;
  nonCompliantIncomeRatio: number | null;
  /** Amount to donate. null when the ratio is unknown — a missing
   * ratio must never silently compute as "nothing to purify". */
  purificationAmount: number | null;
  /** What may be kept. Also null when unknown, for the same reason. */
  netAmount: number | null;
}

/**
 * Pure arithmetic — trusts its input. Validating a user-submitted
 * dividend amount (e.g. rejecting negative numbers) is the API
 * boundary's job (see app.ts, which parses the request with zod
 * before this function ever runs) — this function only computes.
 */
export function calculatePurification(input: PurificationInput): PurificationResult {
  if (input.nonCompliantIncomeRatio === null) {
    return {
      dividendReceived: input.dividendReceived,
      nonCompliantIncomeRatio: null,
      purificationAmount: null,
      netAmount: null,
    };
  }

  const purificationAmount = input.dividendReceived * input.nonCompliantIncomeRatio;

  return {
    dividendReceived: input.dividendReceived,
    nonCompliantIncomeRatio: input.nonCompliantIncomeRatio,
    purificationAmount,
    netAmount: input.dividendReceived - purificationAmount,
  };
}
