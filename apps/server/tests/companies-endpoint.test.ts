import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, type CompanySummary } from "../src/app.js";

describe("GET /companies", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns the watchlist with status and price", async () => {
    const companies: CompanySummary[] = [
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        status: "COMPLIANT",
        latestPrice: "196.5",
        computedAt: "2026-07-30T12:00:00.000Z",
      },
      {
        symbol: "MGM",
        name: "MGM Resorts International",
        status: "NON_COMPLIANT",
        latestPrice: "42.1",
        computedAt: "2026-07-30T12:00:00.000Z",
      },
    ];
    app = await buildApp({ logger: false, listCompanies: () => Promise.resolve(companies) });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/companies" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ companies });
  });

  it("returns an empty list, not an error, when no lookup is injected", async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/companies" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ companies: [] });
  });

  it("represents a company with no verdict yet as null fields, not a crash", async () => {
    const companies: CompanySummary[] = [
      { symbol: "T", name: "AT&T Inc.", status: null, latestPrice: null, computedAt: null },
    ];
    app = await buildApp({ logger: false, listCompanies: () => Promise.resolve(companies) });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/companies" });

    expect(res.json()).toEqual({ companies });
  });
});
