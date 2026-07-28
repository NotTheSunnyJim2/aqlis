import "dotenv/config";
import { createPrismaClient } from "../src/db.js";

/**
 * Seeds the watchlist companies. Required before consumers can write a
 * single price/fundamentals snapshot — those tables have a NOT NULL
 * foreign key to companies, and the stream entries carry only a symbol
 * string, not a company row.
 *
 * `sector` matters beyond bookkeeping: it's a direct input to the
 * business-activity exclusion screen (Phase 9) — e.g. Financial
 * Services -> conventional banking is excluded outright.
 */
const watchlist = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", sector: "Technology" },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    exchange: "NASDAQ",
    sector: "Consumer Cyclical",
  },
  { symbol: "XOM", name: "Exxon Mobil Corporation", exchange: "NYSE", sector: "Energy" },
  { symbol: "JNJ", name: "Johnson & Johnson", exchange: "NYSE", sector: "Healthcare" },
  {
    symbol: "JPM",
    name: "JPMorgan Chase & Co.",
    exchange: "NYSE",
    sector: "Financial Services",
  },
  {
    symbol: "BAC",
    name: "Bank of America Corporation",
    exchange: "NYSE",
    sector: "Financial Services",
  },
  {
    symbol: "MGM",
    name: "MGM Resorts International",
    exchange: "NYSE",
    sector: "Consumer Cyclical",
  },
  { symbol: "T", name: "AT&T Inc.", exchange: "NYSE", sector: "Communication Services" },
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
      update: { name: company.name, exchange: company.exchange, sector: company.sector },
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
