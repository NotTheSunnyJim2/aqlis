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

export interface PurificationResult {
  symbol: string;
  dividendReceived: number;
  nonCompliantIncomeRatio: number | null;
  purificationAmount: number | null;
  netAmount: number | null;
}

/**
 * Unlike fetchVerdict, any non-2xx here throws — this is only ever
 * called for a symbol the user already selected from a known-valid
 * list, so a 404 would indicate something genuinely wrong, not a
 * routine "no data yet" case worth swallowing.
 */
export async function calculatePurification(
  symbol: string,
  dividendReceived: number,
): Promise<PurificationResult> {
  const res = await fetch(`/api/companies/${encodeURIComponent(symbol)}/purification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dividendReceived }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to calculate purification: HTTP ${res.status}`);
  }
  return (await res.json()) as PurificationResult;
}

export interface PathSummary {
  percentilesByDay: Array<{ day: number; p5: number; p25: number; p50: number; p75: number; p95: number }>;
  finalValue: { mean: number; stdev: number; p5: number; p50: number; p95: number; probabilityOfLoss: number };
}

export interface PortfolioComparison {
  halalSymbols: string[];
  conventionalSymbols: string[];
  halal: PathSummary;
  conventional: PathSummary;
  computedAt: string;
}

/**
 * Returns null for a 503 (Phase 20's background-refreshed simulation
 * cache not warm yet, e.g. right after server startup) rather than
 * throwing — routine and expected, not an error worth surfacing as one.
 */
export async function fetchPortfolioComparison(): Promise<PortfolioComparison | null> {
  const res = await fetch("/api/monte-carlo");
  if (res.status === 503) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch portfolio comparison: HTTP ${res.status}`);
  }
  return (await res.json()) as PortfolioComparison;
}
