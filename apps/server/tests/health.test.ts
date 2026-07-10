import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("responds 200 with status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });

  it("reports process uptime as a positive number", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    const body = res.json<{ uptime: number }>();
    expect(body.uptime).toBeGreaterThan(0);
  });
});
