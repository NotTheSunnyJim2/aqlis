export interface CompanySummary {
  symbol: string;
  name: string;
  /** null = no verdict computed yet — distinct from a computed UNKNOWN
   * verdict (missing data at screening time). The badge renders these
   * differently — see ComplianceBadge.tsx. */
  status: "COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN" | null;
  latestPrice: string | null;
  computedAt: string | null;
}

export async function fetchCompanies(): Promise<CompanySummary[]> {
  const res = await fetch("/api/companies");
  if (!res.ok) {
    throw new Error(`Failed to fetch companies: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { companies: CompanySummary[] };
  return data.companies;
}

export interface VerdictDetail {
  symbol: string;
  status: "COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN" | null;
  businessActivityPass: boolean | null;
  marketCap: string | null;
  debtRatio: number | null;
  cashRatio: number | null;
  receivablesRatio: number | null;
  nonCompliantIncomeRatio: number | null;
  reasons: string[];
  computedAt: string | null;
}

/** Returns null for a 404 (unknown symbol) rather than throwing — that's
 * a normal, expected outcome here (e.g. a stale selection), not an
 * error worth an error boundary. */
export async function fetchVerdict(symbol: string): Promise<VerdictDetail | null> {
  const res = await fetch(`/api/companies/${encodeURIComponent(symbol)}/verdict`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch verdict for ${symbol}: HTTP ${res.status}`);
  }
  return (await res.json()) as VerdictDetail;
}
