/**
 * Business-activity exclusion screen.
 *
 * Source: S&P Dow Jones Islamic Market Indices Methodology, S&P Dow
 * Jones Indices LLC (current edition, Feb 2026):
 * https://www.spglobal.com/spdji/en/documents/methodologies/methodology-dj-islamic-market-indices.pdf
 *
 * A company whose CORE BUSINESS falls in an excluded category fails
 * outright, regardless of its financial ratios — this is a categorical
 * gate, not a threshold. Classification is by `industry` (fine-grained,
 * e.g. "Resorts & Casinos"), not `sector` (too coarse — see
 * prisma/seed.ts for why MGM and TSLA can't be told apart by sector
 * alone).
 *
 * Two known simplifications, documented rather than hidden:
 *  - WEAPONS_AND_DEFENSE: the source methodology screens by REVENUE
 *    percentage from weapons/defense activity, not a blanket industry
 *    exclusion (a mixed civilian/defense aerospace firm is judged on
 *    its mix). We lack a revenue-mix breakdown from FMP, so we
 *    classify by industry — correct for a pure-play defense
 *    contractor, imprecise for a mixed one.
 *  - The source's broader "impure entertainment" category (cinema,
 *    music, hotels) is deliberately OUT of scope here: it's the most
 *    debated, inconsistently-applied category across Shariah boards
 *    and index providers, and nothing in the current watchlist touches
 *    it. Logged as a deferred item, not silently dropped.
 */

export type ExclusionCategory =
  | "CONVENTIONAL_FINANCIAL_SERVICES"
  | "GAMBLING"
  | "ALCOHOL"
  | "TOBACCO"
  | "PORK"
  | "WEAPONS_AND_DEFENSE"
  | "ADULT_ENTERTAINMENT";

/**
 * Keyword STEMS, matched as plain lowercase substrings — not `\b`-
 * bounded regexes. Real industry names are inflected ("Banks", not
 * "Bank"; "Casinos", not "Casino"), and a trailing `\b` after a
 * singular stem fails to match its own plural (no boundary between
 * "k" and "s" in "Banks" — both are word characters). Substring
 * matching on stems ("bank", "casino", "lend") catches every
 * inflection at once and is easier to reason about than juggling
 * boundary edge cases.
 */
const EXCLUSION_KEYWORDS: [ExclusionCategory, string[]][] = [
  ["CONVENTIONAL_FINANCIAL_SERVICES", ["bank", "insur", "lend", "mortgage"]],
  ["GAMBLING", ["casino", "gambl", "betting", "lottery"]],
  ["ALCOHOL", ["brewer", "distiller", "winer", "alcohol"]],
  ["TOBACCO", ["tobacco"]],
  ["PORK", ["pork", "swine"]],
  ["WEAPONS_AND_DEFENSE", ["defense"]],
  ["ADULT_ENTERTAINMENT", ["adult entertainment", "pornograph"]],
];

export interface BusinessActivityInput {
  sector: string | null;
  industry: string | null;
}

export interface BusinessActivityResult {
  pass: boolean;
  /** Which excluded category matched, or null if it passed. */
  category: ExclusionCategory | null;
  /** Human-readable reason code for ComplianceVerdict.reasons. */
  reason: string | null;
}

/**
 * Screens a company's classification against the exclusion list.
 * `industry` is checked first (fine-grained, authoritative); `sector`
 * is a fallback ONLY for a company with no industry classification —
 * see the MGM/TSLA case for why sector alone is unreliable when
 * industry IS available.
 */
export function screenBusinessActivity(
  input: BusinessActivityInput,
): BusinessActivityResult {
  const candidate = input.industry ?? input.sector;

  if (!candidate) {
    // No classification at all: can't clear the company, but this
    // isn't the same as "known excluded" — the caller (the verdict
    // combiner) treats this as UNKNOWN, not a hard fail.
    return { pass: false, category: null, reason: "MISSING_CLASSIFICATION" };
  }

  const lowerCandidate = candidate.toLowerCase();
  for (const [category, keywords] of EXCLUSION_KEYWORDS) {
    if (keywords.some((keyword) => lowerCandidate.includes(keyword))) {
      return { pass: false, category, reason: `EXCLUDED_ACTIVITY:${category}` };
    }
  }

  return { pass: true, category: null, reason: null };
}
