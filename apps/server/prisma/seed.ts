import "dotenv/config";
import { createPrismaClient } from "../src/db.js";

/**
 * Seeds the watchlist companies. Required before consumers can write a
 * single price/fundamentals snapshot — those tables have a NOT NULL
 * foreign key to companies, and the stream entries carry only a symbol
 * string, not a company row.
 *
 * `industry` (not just `sector`) is the real input to the Phase 9
 * business-activity screen: MGM and TSLA share the sector "Consumer
 * Cyclical", but only MGM's industry ("Resorts & Casinos") is excluded
 * — sector alone can't make that distinction.
 */
const watchlist = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    exchange: "NASDAQ",
    sector: "Technology",
    industry: "Consumer Electronics",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    exchange: "NASDAQ",
    sector: "Technology",
    industry: "Software—Infrastructure",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    exchange: "NASDAQ",
    sector: "Technology",
    industry: "Semiconductors",
  },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    exchange: "NASDAQ",
    sector: "Consumer Cyclical",
    industry: "Auto Manufacturers",
  },
  {
    symbol: "XOM",
    name: "Exxon Mobil Corporation",
    exchange: "NYSE",
    sector: "Energy",
    industry: "Oil & Gas Integrated",
  },
  {
    symbol: "JNJ",
    name: "Johnson & Johnson",
    exchange: "NYSE",
    sector: "Healthcare",
    industry: "Drug Manufacturers—General",
  },
  {
    symbol: "JPM",
    name: "JPMorgan Chase & Co.",
    exchange: "NYSE",
    sector: "Financial Services",
    industry: "Banks—Diversified",
  },
  {
    symbol: "BAC",
    name: "Bank of America Corporation",
    exchange: "NYSE",
    sector: "Financial Services",
    industry: "Banks—Diversified",
  },
  {
    symbol: "MGM",
    name: "MGM Resorts International",
    exchange: "NYSE",
    sector: "Consumer Cyclical",
    industry: "Resorts & Casinos",
  },
  {
    symbol: "T",
    name: "AT&T Inc.",
    exchange: "NYSE",
    sector: "Communication Services",
    industry: "Telecom Services",
  },
];

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the seed script");
}
const prisma = createPrismaClient(databaseUrl);

async function main(): Promise<void> {
  for (const company of watchlist) {
    // Upsert, not create: re-running the seed (e.g. after adding a
    // symbol) must not fail on already-seeded rows or duplicate them.
    await prisma.company.upsert({
      where: { symbol: company.symbol },
      update: {
        name: company.name,
        exchange: company.exchange,
        sector: company.sector,
        industry: company.industry,
      },
      create: company,
    });
    console.log(`seeded ${company.symbol}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Without this the process hangs — Prisma holds the connection open.
    void prisma.$disconnect();
  });
