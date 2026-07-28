import Fastify, { type FastifyInstance } from "fastify";

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
}

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

  return app;
}
