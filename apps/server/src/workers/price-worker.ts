import "dotenv/config";
import { Redis } from "ioredis";
import pino from "pino";
import { loadConfig } from "../config.js";
import { PriceBuffer } from "../ingestion/price-buffer.js";
import { PricePublisher } from "../ingestion/price-publisher.js";
import { FinnhubPriceClient } from "../ingestion/finnhub-client.js";

/**
 * Price ingestion worker — the composition root that wires the pure
 * units together and owns the I/O they don't:
 *
 *   Finnhub WS --onTrade--> PriceBuffer --(flush timer)--> PricePublisher --> Redis Stream
 *
 * Each unit is independently testable; this file is where concrete
 * dependencies (config, Redis, logger) are created and connected.
 */

const logger = pino(
  process.env.NODE_ENV === "production"
    ? {} // raw JSON lines in production
    : { transport: { target: "pino-pretty" } },
);

function main(): void {
  const config = loadConfig();
  logger.info(
    { symbols: config.watchlist, flushMs: config.priceFlushIntervalMs },
    "starting price worker",
  );

  const redis = new Redis(config.redisUrl);
  redis.on("connect", () => {
    logger.info({}, "redis connected");
  });
  redis.on("error", (err: Error) => {
    logger.error({ err: err.message }, "redis error");
  });

  const buffer = new PriceBuffer();
  const publisher = new PricePublisher(redis);

  // Half 1: ticks flow from Finnhub into the buffer.
  const client = new FinnhubPriceClient({
    apiKey: config.finnhubApiKey,
    symbols: config.watchlist,
    logger,
    onTrade: (trade) => {
      buffer.record(trade.symbol, trade.price, new Date(trade.timestampMs));
    },
  });

  // Half 2: on each window, drain the buffer into the stream.
  async function flush(): Promise<void> {
    const prices = buffer.drain();
    if (prices.length === 0) {
      return;
    }
    try {
      const count = await publisher.publish(prices);
      logger.info({ count }, "flushed prices to stream");
    } catch (err) {
      // A dropped window is acceptable for prices: the next window's
      // fresher price supersedes it. (We would NOT drop fundamentals.)
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "price flush failed — window dropped",
      );
    }
  }

  const flushTimer = setInterval(() => {
    void flush();
  }, config.priceFlushIntervalMs);

  client.start();

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "shutting down price worker");
    clearInterval(flushTimer);
    client.stop();
    await flush(); // publish anything still buffered
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
    "price worker crashed on startup",
  );
  process.exit(1);
}
