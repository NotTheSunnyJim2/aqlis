import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, type CompanyRatioLookup } from "../src/app.js";

describe("POST /companies/:symbol/purification", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("computes purification for a known company with a known ratio", async () => {
    app = await buildApp({
      logger: false,
      lookupCompanyRatio: (): Promise<CompanyRatioLookup> =>
        Promise.resolve({ found: true, nonCompliantIncomeRatio: 0.02 }),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/companies/AAPL/purification",
      payload: { dividendReceived: 500 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      symbol: "AAPL",
      dividendReceived: 500,
      nonCompliantIncomeRatio: 0.02,
      purificationAmount: 10,
      netAmount: 490,
    });
  });

  it("upper-cases the symbol from the URL", async () => {
    app = await buildApp({
      logger: false,
      lookupCompanyRatio: (): Promise<CompanyRatioLookup> =>
        Promise.resolve({ found: true, nonCompliantIncomeRatio: 0 }),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/companies/aapl/purification",
      payload: { dividendReceived: 100 },
    });

    expect(res.json()).toMatchObject({ symbol: "AAPL" });
  });

  it("returns 404 for a symbol the lookup doesn't find", async () => {
    app = await buildApp({
      logger: false,
      lookupCompanyRatio: (): Promise<CompanyRatioLookup> =>
        Promise.resolve({ found: false, nonCompliantIncomeRatio: null }),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/companies/ZZZZ/purification",
      payload: { dividendReceived: 100 },
    });

    expect(res.statusCode).toBe(404);
  });

  it("fails safe with 404 when no lookup is injected at all", async () => {
    app = await buildApp({ logger: false }); // no lookupCompanyRatio provided
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/companies/AAPL/purification",
      payload: { dividendReceived: 100 },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns a null purification amount when the ratio is unknown, not a false zero", async () => {
    app = await buildApp({
      logger: false,
      lookupCompanyRatio: (): Promise<CompanyRatioLookup> =>
        Promise.resolve({ found: true, nonCompliantIncomeRatio: null }),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/companies/AAPL/purification",
      payload: { dividendReceived: 500 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ purificationAmount: null, netAmount: null });
  });

  it("returns 400 for a negative dividend amount", async () => {
    app = await buildApp({
      logger: false,
      lookupCompanyRatio: (): Promise<CompanyRatioLookup> =>
        Promise.resolve({ found: true, nonCompliantIncomeRatio: 0.02 }),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/companies/AAPL/purification",
      payload: { dividendReceived: -50 },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a missing dividendReceived field", async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/companies/AAPL/purification",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
