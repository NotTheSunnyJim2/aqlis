import "dotenv/config";
import { Redis } from "ioredis";
import pino from "pino";
import { loadConfig } from "../config.js";
import { FmpClient, FmpRequestError, isRetryableStatus } from "../ingestion/fmp-client.js";
import { FundamentalsPublisher } from "../ingestion/fundamentals-publisher.js";
import type { ParsedFundamentals } from "../ingestion/fmp-fundamentals.js";

/**
 * Fundamentals ingestion worker — same pipeline shape as the price
 * worker (fetch -> normalize -> XADD), but every design force inverts:
 * REST polling instead of a live socket, retry-on-failure instead of
 * drop-on-failure (a missed quarterly filing matters; a missed price
 * tick doesn't), and change detection instead of unconditional writes
 * (see FundamentalsPublisher — filings change ~4x/year, not every poll).
 */

const logger = pino(
  process.env.NODE_ENV === "production" ? {} : { transport: { target: "pino-pretty" } },
);

/** Delay between per-symbol requests: avoids bursting the watchlist as
 * one instant spike, independent of the (generous) daily quota. */
const INTER_SYMBOL_DELAY_MS = 250;

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one symbol's fundamentals, retrying transient failures with
 * exponential backoff. Unlike the price worker, we do NOT give up after
 * one failure — there's no "next tick" that supersedes a missed filing.
 */
async function fetchWithRetry(
  client: FmpClient,
  symbol: string,
): Promise<ParsedFundamentals | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.fetchFundamentals(symbol);
    } catch (err) {
      lastError = err;

      if (err instanceof FmpRequestError && !isRetryableStatus(err.status)) {
        // A 4xx (bad key, restricted symbol, ...) won't change on retry —
        // fail immediately instead of burning quota on doomed attempts.
        logger.error(
          { symbol, status: err.status, err: err.message },
          "non-retryable FMP error — giving up immediately",
        );
        throw err;
      }

      const delay = RETRY_BASE_MS * 2 ** (attempt - 1);
      logger.warn(
        { symbol, attempt, err: err instanceof Error ? err.message : String(err) },
        "fundamentals fetch failed, retrying",
      );
      if (attempt < MAX_ATTEMPTS) {
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

function main(): void {
  const config = loadConfig();
  logger.info(
    { symbols: config.watchlist, pollMs: config.fundamentalsPollIntervalMs },
    "starting fundamentals worker",
  );

  const redis = new Redis(config.redisUrl);
  redis.on("connect", () => logger.info({}, "redis connected"));
  redis.on("error", (err: Error) => logger.error({ err: err.message }, "redis error"));

  const fmpClient = new FmpClient(config.fmpApiKey);
  const publisher = new FundamentalsPublisher(redis);

  async function pollAll(): Promise<void> {
    logger.info({ count: config.watchlist.length }, "polling fundamentals");
    let published = 0;
    let failed = 0;

    for (const symbol of config.watchlist) {
      try {
        const snapshot = await fetchWithRetry(fmpClient, symbol);
        if (!snapshot) {
          logger.warn({ symbol }, "no usable fundamentals data");
          continue;
        }
        const wasNew = await publisher.publishIfNew(snapshot);
        if (wasNew) {
          published++;
          logger.info({ symbol, period: snapshot.period }, "published new fundamentals");
        }
      } catch (err) {
        failed++;
        logger.error(
          { symbol, err: err instanceof Error ? err.message : String(err) },
          "giving up on symbol this cycle",
        );
      }
      await sleep(INTER_SYMBOL_DELAY_MS);
    }

    logger.info({ published, failed }, "poll cycle complete");
  }

  let pollTimer: NodeJS.Timeout | undefined;
  let shuttingDown = false;

  async function runCycle(): Promise<void> {
    await pollAll();
    if (!shuttingDown) {
      pollTimer = setTimeout(() => void runCycle(), config.fundamentalsPollIntervalMs);
    }
  }

  void runCycle(); // poll immediately on startup, then on the interval

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down fundamentals worker");
    if (pollTimer) clearTimeout(pollTimer);
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
    "fundamentals worker crashed on startup",
  );
  process.exit(1);
}
