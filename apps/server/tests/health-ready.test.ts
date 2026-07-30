import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("GET /health/ready", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("is ready when both dependencies are healthy", async () => {
    app = await buildApp({
      logger: false,
      checkDatabase: () => Promise.resolve(true),
      checkRedis: () => Promise.resolve(true),
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/health/ready" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "ready",
      checks: { database: true, redis: true },
    });
  });

  it("returns 503 and identifies the database as the failing check", async () => {
    app = await buildApp({
      logger: false,
      checkDatabase: () => Promise.resolve(false),
      checkRedis: () => Promise.resolve(true),
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/health/ready" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: "not ready",
      checks: { database: false, redis: true },
    });
  });

  it("returns 503 and identifies redis as the failing check", async () => {
    app = await buildApp({
      logger: false,
      checkDatabase: () => Promise.resolve(true),
      checkRedis: () => Promise.resolve(false),
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/health/ready" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ checks: { redis: false } });
  });

  it("defaults to ready when no checks are injected (keeps liveness-only tests simple)", async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/health/ready" });

    expect(res.statusCode).toBe(200);
  });
});
