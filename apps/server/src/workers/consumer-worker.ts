import "dotenv/config";
import { Redis } from "ioredis";
import pino from "pino";
import { loadConfig } from "../config.js";
import { createPrismaClient } from "../db.js";
import { CompanyRegistry } from "../consumers/company-registry.js";
import { StreamConsumer } from "../consumers/stream-consumer.js";
import { parsePriceEntry } from "../consumers/price-entry.js";
import { writePriceSnapshot } from "../consumers/price-writer.js";
import { parseFundamentalsEntry } from "../consumers/fundamentals-entry.js";
import { writeFundamentalsSnapshot } from "../consumers/fundamentals-writer.js";
import { PRICES_STREAM_KEY } from "../ingestion/price-publisher.js";
import { FUNDAMENTALS_STREAM_KEY } from "../ingestion/fundamentals-publisher.js";

/**
 * Consumer worker — the join point of the whole pipeline. Reads both
 * streams via consumer groups (exact mechanics from the Phase 6
 * hands-on Redis Streams session, now automated) and writes normalized
 * rows into Postgres. This is where the two-cadence design (sub-second
 * prices, quarterly fundamentals) becomes one consistent picture.
 */

const logger = pino(
  process.env.NODE_ENV === "production" ? {} : { transport: { target: "pino-pretty" } },
);

const CONSUMER_GROUP = "postgres-writers";
// Fixed name: correct for a single instance. A pool of replicas would
// need unique names per instance (e.g. hostname+pid) so Redis can tell
// them apart within the group — out of scope at our scale.
const CONSUMER_NAME = "consumer-1";

function main(): void {
  const config = loadConfig();
  logger.info({}, "starting consumer worker");

  const redis = new Redis(config.redisUrl);
  redis.on("connect", () => logger.info({}, "redis connected"));
  redis.on("error", (err: Error) => logger.error({ err: err.message }, "redis error"));

  const prisma = createPrismaClient(config.databaseUrl);
  const registry = new CompanyRegistry(prisma);

  const priceConsumer = new StreamConsumer({
    redis,
    streamKey: PRICES_STREAM_KEY,
    groupName: CONSUMER_GROUP,
    consumerName: CONSUMER_NAME,
    logger,
    parseEntry: parsePriceEntry,
    handleEntry: async (entry) => {
      const companyId = registry.resolve(entry.symbol);
      if (!companyId) {
        // Not a parse/write failure — a symbol outside our seeded
        // watchlist. Log and move on; acking is correct here since
        // retrying won't make the company appear.
        logger.warn({ symbol: entry.symbol }, "unknown symbol, skipping price entry");
        return;
      }
      await writePriceSnapshot(prisma, companyId, entry);
    },
  });

  const fundamentalsConsumer = new StreamConsumer({
    redis,
    streamKey: FUNDAMENTALS_STREAM_KEY,
    groupName: CONSUMER_GROUP,
    consumerName: CONSUMER_NAME,
    logger,
    parseEntry: parseFundamentalsEntry,
    handleEntry: async (entry) => {
      const companyId = registry.resolve(entry.symbol);
      if (!companyId) {
        logger.warn({ symbol: entry.symbol }, "unknown symbol, skipping fundamentals entry");
        return;
      }
      await writeFundamentalsSnapshot(prisma, companyId, entry);
    },
  });

  let loopsPromise: Promise<unknown> | undefined;

  async function run(): Promise<void> {
    await registry.load();
    logger.info({ count: registry.size }, "loaded company registry");
    // Two independent streams, two independent problems — run their
    // consumer loops concurrently rather than one blocking the other.
    loopsPromise = Promise.all([priceConsumer.start(), fundamentalsConsumer.start()]);
    await loopsPromise;
  }

  void run();

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "shutting down consumer worker");
    priceConsumer.stop();
    fundamentalsConsumer.stop();
    // stop() only prevents the NEXT loop iteration — a read currently
    // blocked in XREADGROUP must finish before it's safe to close the
    // Redis connection underneath it.
    if (loopsPromise) {
      await loopsPromise;
    }
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

try {
  main();
} catch (err: unknown) {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    "consumer worker crashed on startup",
  );
  process.exit(1);
}
