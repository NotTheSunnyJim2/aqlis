import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import type { Logger } from "../src/logger.js";
import { CompanyRegistry } from "../src/consumers/company-registry.js";
import { recordVerdict } from "../src/consumers/verdict-recorder.js";

const noop = (): void => undefined;
const silentLogger: Logger = { info: noop, warn: noop, error: noop, debug: noop };

/** A fake Prisma Decimal: just enough surface (`.toNumber()`) for the
 * conversion helper in verdict-recorder.ts. */
const decimal = (n: number): { toNumber: () => number } => ({ toNumber: () => n });

interface FakeVerdictRow {
  id: string;
  status: "COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN";
  debtRatio: { toNumber: () => number } | null;
  cashRatio: { toNumber: () => number } | null;
  receivablesRatio: { toNumber: () => number } | null;
  nonCompliantIncomeRatio: { toNumber: () => number } | null;
}

class FakePrisma {
  createdVerdicts: Record<string, unknown>[] = [];
  createdAlerts: Record<string, unknown>[] = [];
  private verdictCounter = 0;

  constructor(
    private readonly latestPrice: { id: string; price: { toNumber: () => number } } | null,
    private readonly latestFundamentals: Record<string, unknown> | null,
    private readonly previousVerdict: FakeVerdictRow | null,
    private readonly companies: { id: string; symbol: string; sector: string | null; industry: string | null }[],
  ) {}

  company = {
    findMany: () => Promise.resolve(this.companies),
  };
  priceSnapshot = {
    findFirst: () => Promise.resolve(this.latestPrice),
  };
  fundamentalsSnapshot = {
    findFirst: () => Promise.resolve(this.latestFundamentals),
  };
  complianceVerdict = {
    findFirst: () => Promise.resolve(this.previousVerdict),
    create: (args: { data: Record<string, unknown> }) => {
      this.verdictCounter += 1;
      const created = { id: `verdict-${this.verdictCounter}`, ...args.data };
      this.createdVerdicts.push(created);
      return Promise.resolve(created);
    },
  };
  driftAlert = {
    create: (args: { data: Record<string, unknown> }) => {
      this.createdAlerts.push(args.data);
      return Promise.resolve({});
    },
  };
}

const asPrisma = (fake: FakePrisma): PrismaClient => fake as unknown as PrismaClient;

const aaplFundamentals = {
  id: "fund-1",
  totalDebt: decimal(84_711_000_000),
  cashAndShortTermInvestments: decimal(68_507_000_000),
  netReceivables: decimal(53_511_000_000),
  revenue: decimal(111_184_000_000),
  interestIncome: decimal(0),
  sharesOutstanding: decimal(14_768_115_000),
};

async function buildRegistry(fake: FakePrisma): Promise<CompanyRegistry> {
  const registry = new CompanyRegistry(asPrisma(fake));
  await registry.load();
  return registry;
}

describe("recordVerdict", () => {
  it("logs and does nothing for a symbol the registry doesn't know", async () => {
    const fake = new FakePrisma(null, null, null, []);
    const registry = await buildRegistry(fake);

    await recordVerdict(asPrisma(fake), registry, "ZZZZ", silentLogger);

    expect(fake.createdVerdicts).toHaveLength(0);
  });

  it("records a company's first-ever verdict with no drift alert (nothing to compare against)", async () => {
    const fake = new FakePrisma(
      { id: "price-1", price: decimal(196) },
      aaplFundamentals,
      null, // no previous verdict
      [{ id: "c1", symbol: "AAPL", sector: "Technology", industry: "Consumer Electronics" }],
    );
    const registry = await buildRegistry(fake);

    await recordVerdict(asPrisma(fake), registry, "AAPL", silentLogger);

    expect(fake.createdVerdicts).toHaveLength(1);
    expect(fake.createdVerdicts[0]).toMatchObject({
      companyId: "c1",
      status: "COMPLIANT",
      priceSnapshotId: "price-1",
      fundamentalsSnapshotId: "fund-1",
    });
    expect(fake.createdAlerts).toHaveLength(0);
  });

  it("creates a DriftAlert when the status flips from the previous verdict", async () => {
    const fake = new FakePrisma(
      { id: "price-1", price: decimal(15) }, // crashed price -> tiny market cap
      aaplFundamentals, // same large debt as before
      {
        id: "prev-verdict",
        status: "COMPLIANT",
        debtRatio: decimal(0.0293),
        cashRatio: decimal(0.0237),
        receivablesRatio: decimal(0.0185),
        nonCompliantIncomeRatio: decimal(0),
      },
      [{ id: "c1", symbol: "AAPL", sector: "Technology", industry: "Consumer Electronics" }],
    );
    const registry = await buildRegistry(fake);

    await recordVerdict(asPrisma(fake), registry, "AAPL", silentLogger);

    expect(fake.createdVerdicts[0]).toMatchObject({ status: "NON_COMPLIANT" });
    expect(fake.createdAlerts).toContainEqual(
      expect.objectContaining({
        type: "VERDICT_FLIPPED",
        fromVerdictId: "prev-verdict",
        toVerdictId: "verdict-1",
      }),
    );
    // The ratio breach itself is ALSO a separate, independently
    // detected event alongside the overall flip.
    expect(fake.createdAlerts).toContainEqual(
      expect.objectContaining({ type: "RATIO_THRESHOLD_CROSSED", ratio: "DEBT" }),
    );
  });

  it("creates no alert when the new verdict matches the previous one", async () => {
    const fake = new FakePrisma(
      { id: "price-1", price: decimal(196) },
      aaplFundamentals,
      {
        id: "prev-verdict",
        status: "COMPLIANT",
        debtRatio: decimal(0.0293),
        cashRatio: decimal(0.0237),
        receivablesRatio: decimal(0.0185),
        nonCompliantIncomeRatio: decimal(0),
      },
      [{ id: "c1", symbol: "AAPL", sector: "Technology", industry: "Consumer Electronics" }],
    );
    const registry = await buildRegistry(fake);

    await recordVerdict(asPrisma(fake), registry, "AAPL", silentLogger);

    expect(fake.createdAlerts).toHaveLength(0);
  });

  it("computes UNKNOWN (not a crash, not a false pass) when no price snapshot exists yet", async () => {
    const fake = new FakePrisma(
      null, // no price yet
      aaplFundamentals,
      null,
      [{ id: "c1", symbol: "AAPL", sector: "Technology", industry: "Consumer Electronics" }],
    );
    const registry = await buildRegistry(fake);

    await recordVerdict(asPrisma(fake), registry, "AAPL", silentLogger);

    expect(fake.createdVerdicts[0]).toMatchObject({ status: "UNKNOWN" });
  });
});
