import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { Redis } from "ioredis";
import pino from "pino";
import { buildApp, type PortfolioComparisonCache } from "./app.js";
import { FmpHistoricalClient } from "./analytics/fmp-historical-client.js";
import { buildPortfolioComparison } from "./analytics/portfolio-comparison.js";
import { loadConfig } from "./config.js";
import { createPrismaClient } from "./db.js";
import { decimalToNumber } from "./decimal.js";
import { ConnectionHub } from "./realtime/connection-hub.js";
import { REALTIME_CHANNEL, type RealtimeEvent } from "./realtime/events.js";

const config = loadConfig();
const prisma = createPrismaClient(config.databaseUrl);
// lazyConnect: don't open the socket until first use — /health (pure
// liveness) shouldn't require Redis to be reachable to answer.
const redis = new Redis(config.redisUrl, { lazyConnect: true });

const logger = pino(
  process.env.NODE_ENV === "production" ? {} : { transport: { target: "pino-pretty" } },
);

// Owned here (not left to buildApp's internal default) because the
// Redis subscriber below must broadcast through this EXACT instance —
// the one the /ws route adds clients to.
const connectionHub = new ConnectionHub(logger);
connectionHub.startHeartbeat();

// Pub/Sub subscribing requires its OWN dedicated connection — once a
// connection calls .subscribe(), it can't run normal commands anymore
// (see realtime/publisher.ts for why Pub/Sub, not Streams, is correct
// here: no persistence needed for a live UI push).
const subscriber = new Redis(config.redisUrl);
subscriber.on("error", (err: Error) => logger.error({ err: err.message }, "subscriber error"));
await subscriber.subscribe(REALTIME_CHANNEL);
subscriber.on("message", (_channel, message) => {
  try {
    connectionHub.broadcast(JSON.parse(message) as RealtimeEvent);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "dropped unparseable realtime message",
    );
  }
});

// `public/` is a sibling of src/ and dist/ (see app.ts's staticRoot
// comment) — so this resolves correctly whether this file is running
// as src/index.ts (tsx, dev) or dist/index.js (node, production).
// Existence-checked rather than env-gated: in dev nothing's built
// there (Vite's own dev server handles the frontend), in production
// the Docker build always populates it — one check covers both.
const staticRoot = path.join(import.meta.dirname, "../public");
const hasStaticBuild = existsSync(staticRoot);
logger.info(
  { staticRoot, hasStaticBuild },
  hasStaticBuild ? "serving built frontend from this server" : "no built frontend found — API only",
);

// Monte Carlo portfolio comparison (Phase 20): recomputed on a
// background timer, never inside a request handler — the simulation
// is CPU-bound (measured: ~500ms combined for both portfolios at 1000
// simulations each) and would stall every concurrent request and
// WebSocket heartbeat if it ran synchronously mid-request. 12h refresh
// interval: the underlying data is daily closes, so anything faster
// than "once a day" buys no real freshness, and this keeps FMP's
// historical-price-eod calls (one per watchlist symbol per refresh)
// far under the free-tier 250/day cap.
const MONTE_CARLO_HORIZON_DAYS = 252; // 1 year
const MONTE_CARLO_NUM_SIMULATIONS = 1000;
const MONTE_CARLO_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

const fmpHistoricalClient = new FmpHistoricalClient(config.fmpApiKey);
let portfolioComparisonCache: PortfolioComparisonCache | null = null;

async function refreshPortfolioComparison(): Promise<void> {
  try {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      select: {
        symbol: true,
        complianceVerdicts: { take: 1, orderBy: { computedAt: "desc" }, select: { status: true } },
      },
    });

    const conventionalSymbols = companies.map((c) => c.symbol);
    const halalSymbols = companies
      .filter((c) => c.complianceVerdicts[0]?.status === "COMPLIANT")
      .map((c) => c.symbol);

    const histories = await Promise.all(
      conventionalSymbols.map(async (symbol) => ({
        symbol,
        closes: await fmpHistoricalClient.fetchDailyCloses(symbol),
      })),
    );

    const { halal, conventional } = buildPortfolioComparison({
      halalSymbols,
      conventionalSymbols,
      histories,
      horizonDays: MONTE_CARLO_HORIZON_DAYS,
      numSimulations: MONTE_CARLO_NUM_SIMULATIONS,
    });

    portfolioComparisonCache = {
      halalSymbols,
      conventionalSymbols,
      halal,
      conventional,
      computedAt: new Date().toISOString(),
    };
    logger.info(
      { halalCount: halalSymbols.length, conventionalCount: conventionalSymbols.length },
      "portfolio comparison refreshed",
    );
  } catch (err) {
    // Never let a bad refresh crash the process or wipe a previously
    // good cache — the endpoint just keeps serving the last successful
    // result (or 503, if there's never been one) until the next timer.
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "portfolio comparison refresh failed",
    );
  }
}

void refreshPortfolioComparison(); // warm the cache without blocking startup
const portfolioComparisonInterval = setInterval(
  () => void refreshPortfolioComparison(),
  MONTE_CARLO_REFRESH_INTERVAL_MS,
);

const app = await buildApp({
  connectionHub,
  getPortfolioComparison: () => portfolioComparisonCache,
  staticRoot: hasStaticBuild ? staticRoot : undefined,
  logger:
    process.env.NODE_ENV === "production"
      ? true // raw JSON lines: logs are data in production
      : { transport: { target: "pino-pretty" } },
  checkDatabase: async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
  checkRedis: async () => {
    try {
      return (await redis.ping()) === "PONG";
    } catch {
      return false;
    }
  },
  listCompanies: async () => {
    // A single query: `take: 1, orderBy` on each relation asks Prisma
    // for each company's LATEST verdict and LATEST price snapshot
    // directly — not an N+1 loop of separate findFirst calls.
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      orderBy: { symbol: "asc" },
      select: {
        symbol: true,
        name: true,
        complianceVerdicts: {
          take: 1,
          orderBy: { computedAt: "desc" },
          select: { status: true, computedAt: true },
        },
        priceSnapshots: {
          take: 1,
          orderBy: { observedAt: "desc" },
          select: { price: true },
        },
      },
    });

    return companies.map((company) => {
      const verdict = company.complianceVerdicts[0];
      const price = company.priceSnapshots[0];
      return {
        symbol: company.symbol,
        name: company.name,
        status: verdict?.status ?? null,
        // .toString() directly on the Decimal — NOT via decimalToNumber,
        // which would round-trip through a lossy float64 for no reason
        // (same precision discipline as the ingestion pipeline).
        latestPrice: price ? price.price.toString() : null,
        computedAt: verdict?.computedAt.toISOString() ?? null,
      };
    });
  },
  lookupCompanyRatio: async (symbol) => {
    const company = await prisma.company.findUnique({ where: { symbol }, select: { id: true } });
    if (!company) {
      return { found: false, nonCompliantIncomeRatio: null };
    }
    const verdict = await prisma.complianceVerdict.findFirst({
      where: { companyId: company.id },
      orderBy: { computedAt: "desc" },
      select: { nonCompliantIncomeRatio: true },
    });
    return {
      found: true,
      nonCompliantIncomeRatio: decimalToNumber(verdict?.nonCompliantIncomeRatio),
    };
  },
  lookupVerdict: async (symbol) => {
    const company = await prisma.company.findUnique({ where: { symbol }, select: { id: true } });
    if (!company) {
      return {
        found: false,
        status: null,
        businessActivityPass: null,
        marketCap: null,
        debtRatio: null,
        cashRatio: null,
        receivablesRatio: null,
        nonCompliantIncomeRatio: null,
        reasons: [],
        computedAt: null,
      };
    }
    const verdict = await prisma.complianceVerdict.findFirst({
      where: { companyId: company.id },
      orderBy: { computedAt: "desc" },
    });
    return {
      found: true,
      status: verdict?.status ?? null,
      businessActivityPass: verdict?.businessActivityPass ?? null,
      // .toString() on the Decimal directly — same precision reasoning
      // as latestPrice in listCompanies above.
      marketCap: verdict?.marketCap ? verdict.marketCap.toString() : null,
      debtRatio: decimalToNumber(verdict?.debtRatio),
      cashRatio: decimalToNumber(verdict?.cashRatio),
      receivablesRatio: decimalToNumber(verdict?.receivablesRatio),
      nonCompliantIncomeRatio: decimalToNumber(verdict?.nonCompliantIncomeRatio),
      reasons: verdict?.reasons ?? [],
      computedAt: verdict?.computedAt.toISOString() ?? null,
    };
  },
});

const port = Number(process.env.PORT ?? 3000);

try {
  // 0.0.0.0, not localhost: inside a container, localhost is the
  // container — the outside world can only reach us on all-interfaces.
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

/** Graceful shutdown: stop accepting, drain in-flight, then exit. */
async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  connectionHub.stopHeartbeat();
  clearInterval(portfolioComparisonInterval);
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  subscriber.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
