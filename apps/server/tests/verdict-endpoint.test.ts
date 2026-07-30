import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, type VerdictDetail } from "../src/app.js";

const tDetail: VerdictDetail = {
  found: true,
  status: "NON_COMPLIANT",
  businessActivityPass: true,
  marketCap: "168996180000",
  debtRatio: 0.9639,
  cashRatio: 0.103967,
  receivablesRatio: 0.050421,
  nonCompliantIncomeRatio: 0,
  reasons: ["RATIO_EXCEEDED:DEBT"],
  computedAt: "2026-07-29T18:38:18.539Z",
};

describe("GET /companies/:symbol/verdict", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns the full ratio breakdown for a known company", async () => {
    app = await buildApp({ logger: false, lookupVerdict: () => Promise.resolve(tDetail) });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/companies/T/verdict" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ symbol: "T", ...tDetail });
  });

  it("upper-cases the symbol from the URL", async () => {
    app = await buildApp({ logger: false, lookupVerdict: () => Promise.resolve(tDetail) });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/companies/t/verdict" });

    expect(res.json()).toMatchObject({ symbol: "T" });
  });

  it("returns 404 for a symbol the lookup doesn't find", async () => {
    app = await buildApp({
      logger: false,
      lookupVerdict: () =>
        Promise.resolve({
          found: false,
          status: null,
          businessActivityPass: null,
          marketCap: null,
          debtRatio: null,
          cashRatio: null,
          receivablesRatio: null,
          nonCompliantIncomeRatio: null,
          reasons: [],
          computedAt: null,
        }),
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/companies/ZZZZ/verdict" });

    expect(res.statusCode).toBe(404);
  });

  it("fails safe with 404 when no lookup is injected at all", async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/companies/AAPL/verdict" });

    expect(res.statusCode).toBe(404);
  });
});
