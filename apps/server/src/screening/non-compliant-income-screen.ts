/**
 * Non-compliant income ratio.
 *
 * Source: S&P Dow Jones Islamic Market Indices Methodology (see
 * business-activity-screen.ts for the full citation). Total
 * non-compliant income must stay under 5% of revenue. This is the same
 * number Phase 11's purification calculator uses: whatever fraction of
 * income IS non-compliant must be donated, not kept, even when the
 * company as a whole passes.
 *
 * SCOPE NOTE: a complete implementation would also include
 * non-compliant BUSINESS-ACTIVITY revenue (e.g. a mostly-clean hotel
 * chain with some casino floor revenue). FMP doesn't expose a
 * revenue-mix breakdown, so this ratio covers interest income only —
 * the component we DO have real data for. Documented, not silently
 * narrowed.
 */

const INCOME_THRESHOLD = 0.05;

export interface IncomeScreenInput {
  revenue: number | null;
  interestIncome: number | null;
}

export interface IncomeRatioResult {
  ratio: number | null;
  pass: boolean | null;
}

export function screenNonCompliantIncome(input: IncomeScreenInput): IncomeRatioResult {
  if (input.revenue === null || input.interestIncome === null || input.revenue <= 0) {
    return { ratio: null, pass: null };
  }
  const ratio = input.interestIncome / input.revenue;
  return { ratio, pass: ratio < INCOME_THRESHOLD };
}
