import Fastify, { type FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { z } from "zod";
import { calculatePurification } from "./screening/purification.js";
import { ConnectionHub } from "./realtime/connection-hub.js";

export interface CompanyRatioLookup {
  found: boolean;
  nonCompliantIncomeRatio: number | null;
}

export interface CompanySummary {
  symbol: string;
  name: string;
  /** null = no verdict computed yet (e.g. before the first worker run),
   * NOT the same as a computed UNKNOWN verdict — see verdict.ts. */
  status: "COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN" | null;
  /** Kept as a string — same precision reasoning as the ingestion
   * pipeline (see consumers/price-entry.ts); null if no price yet. */
  latestPrice: string | null;
  /** ISO 8601, null if no verdict has ever been computed. */
  computedAt: string | null;
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
  /**
   * The dashboard connection registry (Phase 12). Inject your OWN
   * instance when a Redis Pub/Sub subscriber elsewhere (index.ts) needs
   * to call `.broadcast()` on the exact same hub the /ws route adds
   * clients to. If omitted, a private hub is created and its heartbeat
   * managed internally — fine for tests that don't touch /ws.
   */
  connectionHub?: ConnectionHub;
  /** Lists the watchlist with each company's latest verdict/price for
   * the dashboard's stock list. Injected for the same reason as
   * everything else here — app.ts never touches Prisma directly.
   * Omitted -> empty list (fails to "nothing to show", not fake data). */
  listCompanies?: () => Promise<CompanySummary[]>;
}

const purificationBodySchema = z.object({
  dividendReceived: z.number().nonnegative(),
});

/**
 * Builds a fully-configured Fastify app WITHOUT starting it.
 * Construction and listening are separated so tests can exercise
 * routes in-process (app.inject) — no port, no network.
 *
 * ASYNC, and callers must `await` it: @fastify/websocket wraps route
 * handlers via an `onRoute` hook that only sees routes declared AFTER
 * the plugin's own setup has actually run. `register()` merely QUEUES
 * a plugin for avvio's boot sequence — an un-awaited `void
 * app.register(...)` lets subsequent synchronous route declarations
 * race ahead of that boot, so the /ws route below would silently never
 * get recognized as a websocket route (confirmed empirically: it fell
 * through to a plain Request/Reply handler instead of a WebSocket).
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? true,
  });

  await app.register(fastifyWebsocket);

  // Own the hub's heartbeat lifecycle only when WE created it —
  // an injected hub is owned (started/stopped) by whoever constructed
  // it (index.ts, alongside its Redis subscriber).
  const connectionHub = opts.connectionHub ?? new ConnectionHub(app.log);
  if (!opts.connectionHub) {
    connectionHub.startHeartbeat();
  }

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
   * The watchlist, each with its latest compliance status and price —
   * what the dashboard's stock list renders as badges.
   */
  app.get("/companies", async () => {
    const companies = opts.listCompanies ? await opts.listCompanies() : [];
    return { companies };
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

  /**
   * Live dashboard feed: prices and compliance drift alerts, pushed
   * the instant the consumer worker (Phase 8/10) produces them — via
   * a Redis Pub/Sub subscriber in index.ts calling connectionHub's
   * broadcast(). This route's only job is registering each connecting
   * client with the hub; @fastify/websocket hands us the raw `ws`
   * socket directly (current-version API — older versions nested it
   * under `connection.socket`).
   */
  app.get("/ws", { websocket: true }, (socket) => {
    connectionHub.add(socket);
  });

  return app;
}
