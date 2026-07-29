import type { PrismaClient } from "../generated/prisma/client.js";

export interface CompanyRecord {
  id: string;
  symbol: string;
  sector: string | null;
  industry: string | null;
}

/**
 * Caches Company rows by symbol. Loaded once at startup from the
 * seeded watchlist (ten rows) rather than querying Postgres per stream
 * entry — the mapping is small and changes only when the watchlist
 * itself does. Also serves the screening engine's sector/industry
 * input directly from the same cache, avoiding a second round-trip
 * per verdict recompute.
 *
 * A symbol not found here (never seeded — see prisma/seed.ts) is a
 * real data problem, not a transient one: the caller should log it and
 * skip the entry rather than crash the whole consumer loop.
 */
export class CompanyRegistry {
  private readonly bySymbol = new Map<string, CompanyRecord>();

  constructor(private readonly prisma: PrismaClient) {}

  async load(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      select: { id: true, symbol: true, sector: true, industry: true },
    });
    this.bySymbol.clear();
    for (const company of companies) {
      this.bySymbol.set(company.symbol, company);
    }
  }

  resolve(symbol: string): string | undefined {
    return this.bySymbol.get(symbol)?.id;
  }

  get(symbol: string): CompanyRecord | undefined {
    return this.bySymbol.get(symbol);
  }

  get size(): number {
    return this.bySymbol.size;
  }
}
