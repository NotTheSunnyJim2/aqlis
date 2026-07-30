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
