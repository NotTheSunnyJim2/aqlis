/**
 * Translates the screening engine's machine-readable reason codes
 * (verdict.ts, Phase 9) into human-readable text for the ratio
 * breakdown view. Codes follow a consistent PREFIX:SUFFIX shape, so
 * one parser handles all of them rather than hardcoding every
 * combination — new categories/ratios added server-side show up here
 * automatically (falling back to the raw suffix if unrecognized,
 * never hiding an unmapped code).
 */

const CATEGORY_LABELS: Record<string, string> = {
  GAMBLING: "Gambling",
  CONVENTIONAL_FINANCIAL_SERVICES: "Conventional financial services",
  ALCOHOL: "Alcohol",
  TOBACCO: "Tobacco",
  PORK: "Pork",
  WEAPONS_AND_DEFENSE: "Weapons & defense",
  ADULT_ENTERTAINMENT: "Adult entertainment",
};

const RATIO_LABELS: Record<string, string> = {
  DEBT: "Debt ratio",
  CASH: "Cash & interest-bearing securities ratio",
  RECEIVABLES: "Receivables ratio",
  NON_COMPLIANT_INCOME: "Non-compliant income ratio",
  BUSINESS_ACTIVITY_CLASSIFICATION: "Business activity classification",
};

export function describeReason(code: string): string {
  const [prefix, suffix] = code.split(":");

  if (prefix === "EXCLUDED_ACTIVITY" && suffix) {
    return `Excluded business activity: ${CATEGORY_LABELS[suffix] ?? suffix}`;
  }
  if (prefix === "RATIO_EXCEEDED" && suffix) {
    return `${RATIO_LABELS[suffix] ?? suffix} exceeds its threshold`;
  }
  if (prefix === "UNKNOWN" && suffix) {
    // UNKNOWN codes append "_RATIO" to the ratio name (verdict.ts:
    // `UNKNOWN:${name}_RATIO`), but RATIO_EXCEEDED codes use the bare
    // name — an asymmetry in the backend's own code generation.
    // Strip it before lookup so both prefixes share one label table;
    // BUSINESS_ACTIVITY_CLASSIFICATION has no such suffix, so this is
    // a harmless no-op for it.
    const key = suffix.replace(/_RATIO$/, "");
    return `${RATIO_LABELS[key] ?? suffix} is unknown — missing data`;
  }
  return code; // unrecognized shape: show the raw code, never hide it
}
