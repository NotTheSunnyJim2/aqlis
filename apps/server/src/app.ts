import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { calculatePurification } from "./screening/purification.js";

export interface CompanyRatioLookup {
  found: boolean;
  nonCompliantIncomeRatio: number | null;
}

export interface BuildAppOptions {
  /** Fastify logger config; tests pass `false` to keep output clean. */
  logger?: boolean | object;
  /**
   * Readiness checks, injected rather than constructed here — app.ts
   * stays decoupled from concrete Prisma/Redis clients, and tests can
   * simulate "database down" without a real connection. Omitted checks
   * default to healthy, so existing tests that only care about
   * liveness don't need to change.
   */
  checkDatabase?: () => Promise<boolean>;
  checkRedis?: () => Promise<boolean>;
  /**
   * Looks up a company's current non-compliant income ratio by symbol
   * (its latest ComplianceVerdict — see verdict-recorder.ts). Injected
   * for the same reason as the checks above: app.ts never touches
   * Prisma directly. UNLIKE the checks, an omitted lookup defaults to
   * `found: false` — failing safe (404) rather than silently claiming
   * every symbol exists, which a "default to healthy"-style fallback
   * would do here.
   */
  lookupCompanyRatio?: (symbol: string) => Promise<CompanyRatioLookup>;
}

const purificationBodySchema = z.object({
  dividendReceived: z.number().nonnegative(),
});

/**
 * Builds a fully-configured Fastify app WITHOUT starting it.
 * Construction and listening are separated so tests can exercise
 * routes in-process (app.inject) — no port, no network.
 */
export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ?? true,
  });

  /**
   * Liveness probe: "is the process up and serving HTTP?"
   * Deliberately checks NO dependencies — see /health/ready (planned,
   * Phase 8) for the readiness probe that will ping Postgres/Redis.
   */
  app.get("/health", () => {
    return {
      status: "ok" as const,
      uptime: process.uptime(),
    };
  });

  /**
   * Readiness probe: "can this instance currently do useful work?"
   * Distinct from /health on purpose (see the comment there) — an
   * orchestrator should stop ROUTING traffic here on failure, not
   * restart the process. A DB blip is not a reason to kill a healthy
   * Node process; it's a reason to wait until the DB is back.
   */
  app.get("/health/ready", async (_request, reply) => {
    const [databaseOk, redisOk] = await Promise.all([
      opts.checkDatabase?.() ?? Promise.resolve(true),
      opts.checkRedis?.() ?? Promise.resolve(true),
    ]);

    const ready = databaseOk && redisOk;
    if (!ready) {
      reply.status(503);
    }
    return {
      status: ready ? ("ready" as const) : ("not ready" as const),
      checks: { database: databaseOk, redis: redisOk },
    };
  });

  /**
   * Income purification — NOT zakat (see purification.ts / README for
   * the distinction). Given a dividend amount, returns how much of it
   * should be donated based on the company's current non-compliant
   * income ratio (Phase 9).
   */
  app.post("/companies/:symbol/purification", async (request, reply) => {
    const paramsResult = z.object({ symbol: z.string().min(1) }).safeParse(request.params);
    if (!paramsResult.success) {
      reply.status(400);
      return { error: "symbol path parameter is required" };
    }

    const bodyResult = purificationBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      reply.status(400);
      return {
        error: "invalid request body",
        issues: bodyResult.error.issues.map((issue) => issue.message),
      };
    }

    const symbol = paramsResult.data.symbol.toUpperCase();
    // No injected lookup -> fail safe: treat every symbol as unknown
    // rather than silently pretending it exists.
    const lookup = opts.lookupCompanyRatio
      ? await opts.lookupCompanyRatio(symbol)
      : { found: false, nonCompliantIncomeRatio: null };

    if (!lookup.found) {
      reply.status(404);
      return { error: `unknown symbol: ${symbol}` };
    }

    const result = calculatePurification({
      dividendReceived: bodyResult.data.dividendReceived,
      nonCompliantIncomeRatio: lookup.nonCompliantIncomeRatio,
    });

    return { symbol, ...result };
  });

  return app;
}
