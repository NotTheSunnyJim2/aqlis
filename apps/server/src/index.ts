import "dotenv/config";
import { Redis } from "ioredis";
import pino from "pino";
import { buildApp } from "./app.js";
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

const app = await buildApp({
  connectionHub,
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
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  subscriber.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
