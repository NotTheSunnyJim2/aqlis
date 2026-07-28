import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Caches symbol -> Company.id. Loaded once at startup from the seeded
 * watchlist (ten rows) rather than querying Postgres for every stream
 * entry — the mapping is small and changes only when the watchlist
 * itself does.
 *
 * A symbol not found here (never seeded — see prisma/seed.ts) is a
 * real data problem, not a transient one: the caller should log it and
 * skip the entry rather than crash the whole consumer loop.
 */
export class CompanyRegistry {
  private readonly idBySymbol = new Map<string, string>();

  constructor(private readonly prisma: PrismaClient) {}

  async load(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      select: { id: true, symbol: true },
    });
    this.idBySymbol.clear();
    for (const company of companies) {
      this.idBySymbol.set(company.symbol, company.id);
    }
  }

  resolve(symbol: string): string | undefined {
    return this.idBySymbol.get(symbol);
  }

  get size(): number {
    return this.idBySymbol.size;
  }
}
