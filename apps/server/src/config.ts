import { z } from "zod";

/**
 * The environment this service requires, described once. Zod both
 * validates at runtime AND gives us the static type — one source of
 * truth. Parsing happens at the boundary; everything downstream
 * consumes the typed AppConfig, never raw process.env.
 */
const envSchema = z.object({
  REDIS_URL: z
    .string()
    .startsWith("rediss://", "REDIS_URL must be a TLS Upstash URL (rediss://)"),
  // The POOLED Neon connection — see prisma.config.ts for why migrations
  // use a separate DIRECT connection instead.
  DATABASE_URL: z
    .string()
    .startsWith("postgresql://", "DATABASE_URL must be a postgresql:// connection string"),
  FINNHUB_API_KEY: z.string().min(1, "FINNHUB_API_KEY is required"),
  FMP_API_KEY: z.string().min(1, "FMP_API_KEY is required"),
  WATCHLIST_SYMBOLS: z.string().min(1, "WATCHLIST_SYMBOLS is required"),
  // Strings from the environment are coerced to a number and bounded.
  // Absent -> defaults to 30s.
  PRICE_FLUSH_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  // Fundamentals change quarterly; polling every 6h is ample and keeps
  // FMP requests (24 per poll) well under the 250/day free-tier cap.
  FUNDAMENTALS_POLL_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(21_600),
});

/** Validated, typed configuration used across the app. */
export interface AppConfig {
  redisUrl: string;
  databaseUrl: string;
  finnhubApiKey: string;
  fmpApiKey: string;
  /** Upper-cased, de-duplicated ticker list. */
  watchlist: string[];
  /** Flush cadence in milliseconds (derived from the *_SECONDS env var). */
  priceFlushIntervalMs: number;
  /** Fundamentals poll cadence in milliseconds. */
  fundamentalsPollIntervalMs: number;
}

/**
 * Parse and validate configuration. Throws a single, aggregated error
 * at startup if anything is missing or malformed — fail fast and loud,
 * never let an undefined surface three layers deep at runtime.
 *
 * Takes the source env as an argument (defaulting to process.env) so
 * tests can exercise it with fixtures instead of real environment.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;

  const watchlist = [
    ...new Set(
      env.WATCHLIST_SYMBOLS.split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => symbol.length > 0),
    ),
  ];

  if (watchlist.length === 0) {
    throw new Error("WATCHLIST_SYMBOLS contained no valid ticker symbols");
  }

  return {
    redisUrl: env.REDIS_URL,
    databaseUrl: env.DATABASE_URL,
    finnhubApiKey: env.FINNHUB_API_KEY,
    fmpApiKey: env.FMP_API_KEY,
    watchlist,
    priceFlushIntervalMs: env.PRICE_FLUSH_INTERVAL_SECONDS * 1000,
    fundamentalsPollIntervalMs: env.FUNDAMENTALS_POLL_INTERVAL_SECONDS * 1000,
  };
}
