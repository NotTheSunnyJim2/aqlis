import { screenBusinessActivity } from "./business-activity-screen.js";
import { computeMarketCap, screenFinancialRatios } from "./financial-ratio-screen.js";
import { screenNonCompliantIncome } from "./non-compliant-income-screen.js";

export type VerdictStatus = "COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN";

export interface VerdictInput {
  sector: string | null;
  industry: string | null;
  price: number | null;
  sharesOutstanding: number | null;
  totalDebt: number | null;
  cashAndShortTermInvestments: number | null;
  netReceivables: number | null;
  revenue: number | null;
  interestIncome: number | null;
}

export interface Verdict {
  status: VerdictStatus;
  /** Machine-readable codes: "EXCLUDED_ACTIVITY:x", "RATIO_EXCEEDED:x",
   * or "UNKNOWN:x" — mirrors ComplianceVerdict.reasons in the schema. */
  reasons: string[];
  /** true = passed, false = CONFIRMED excluded, null = unknown
   * (missing classification) — distinct from a confirmed exclusion. */
  businessActivityPass: boolean | null;
  marketCap: number | null;
  debtRatio: number | null;
  cashRatio: number | null;
  receivablesRatio: number | null;
  nonCompliantIncomeRatio: number | null;
}

/**
 * Combines the business-activity screen, the three financial ratios,
 * and the non-compliant-income ratio into one verdict.
 *
 * Precedence: a CONFIRMED failure (excluded activity, or a ratio over
 * threshold) always yields NON_COMPLIANT — a definite "no" doesn't
 * become uncertain just because some UNRELATED input is also missing.
 * Absent any confirmed failure, any missing input yields UNKNOWN
 * (never a false COMPLIANT). Only when every screen is both known and
 * passing does the verdict become COMPLIANT.
 */
export function computeVerdict(input: VerdictInput): Verdict {
  const reasons: string[] = [];
  let hasFailure = false;
  let hasUnknown = false;

  const activity = screenBusinessActivity({ sector: input.sector, industry: input.industry });
  const activityReason = activity.reason;
  let businessActivityPass: boolean | null;

  if (activity.category !== null && activityReason !== null) {
    businessActivityPass = false;
    hasFailure = true;
    reasons.push(activityReason);
  } else if (activityReason === "MISSING_CLASSIFICATION") {
    businessActivityPass = null;
    hasUnknown = true;
    reasons.push("UNKNOWN:BUSINESS_ACTIVITY_CLASSIFICATION");
  } else {
    businessActivityPass = true;
  }

  const marketCap = computeMarketCap(input.price, input.sharesOutstanding);
  const ratios = screenFinancialRatios({
    marketCap,
    totalDebt: input.totalDebt,
    cashAndShortTermInvestments: input.cashAndShortTermInvestments,
    netReceivables: input.netReceivables,
  });
  const income = screenNonCompliantIncome({
    revenue: input.revenue,
    interestIncome: input.interestIncome,
  });

  // Names match the Postgres RatioKind enum (schema.prisma) — same
  // vocabulary from screening engine through to drift alerts.
  const namedRatios: [string, { pass: boolean | null }][] = [
    ["DEBT", ratios.debt],
    ["CASH", ratios.cash],
    ["RECEIVABLES", ratios.receivables],
    ["NON_COMPLIANT_INCOME", income],
  ];

  for (const [name, result] of namedRatios) {
    if (result.pass === false) {
      hasFailure = true;
      reasons.push(`RATIO_EXCEEDED:${name}`);
    } else if (result.pass === null) {
      hasUnknown = true;
      reasons.push(`UNKNOWN:${name}_RATIO`);
    }
  }

  const status: VerdictStatus = hasFailure
    ? "NON_COMPLIANT"
    : hasUnknown
      ? "UNKNOWN"
      : "COMPLIANT";

  return {
    status,
    reasons,
    businessActivityPass,
    marketCap,
    debtRatio: ratios.debt.ratio,
    cashRatio: ratios.cash.ratio,
    receivablesRatio: ratios.receivables.ratio,
    nonCompliantIncomeRatio: income.ratio,
  };
}
