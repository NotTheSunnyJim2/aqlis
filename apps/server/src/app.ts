import Fastify, { type FastifyInstance } from "fastify";

export interface BuildAppOptions {
  /** Fastify logger config; tests pass `false` to keep output clean. */
  logger?: boolean | object;
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

  return app;
}
