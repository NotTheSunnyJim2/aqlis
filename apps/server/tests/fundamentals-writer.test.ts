import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { writeFundamentalsSnapshot } from "../src/consumers/fundamentals-writer.js";
import type { FundamentalsStreamEntry } from "../src/consumers/fundamentals-entry.js";

class FakePrisma {
  readonly upsertCalls: unknown[] = [];
  fundamentalsSnapshot = {
    upsert: (args: unknown) => {
      this.upsertCalls.push(args);
      return Promise.resolve({});
    },
  };
}

const asPrisma = (fake: FakePrisma): PrismaClient => fake as unknown as PrismaClient;

const entry: FundamentalsStreamEntry = {
  symbol: "AAPL",
  periodEndDate: new Date("2026-03-28"),
  period: "Q2",
  fiscalYear: "2026",
  acceptedAt: new Date("2026-05-01T10:01:00"),
  reportedCurrency: "USD",
  totalDebt: "84711000000",
  cashAndShortTermInvestments: "68507000000",
  netReceivables: "53511000000",
  totalAssets: "371082000000",
  revenue: "111184000000",
  interestIncome: "0",
  sharesOutstanding: "14768115000",
};

describe("writeFundamentalsSnapshot", () => {
  it("upserts on (companyId, periodEndDate, period)", async () => {
    const prisma = new FakePrisma();

    await writeFundamentalsSnapshot(asPrisma(prisma), "company-1", entry);

    const call = prisma.upsertCalls[0] as { where: unknown; update: unknown; create: unknown };
    expect(call.where).toEqual({
      companyId_periodEndDate_period: {
        companyId: "company-1",
        periodEndDate: entry.periodEndDate,
        period: "Q2",
      },
    });
    expect(call.update).toEqual({});
  });

  it("passes a real zero interestIncome through, not null", async () => {
    const prisma = new FakePrisma();

    await writeFundamentalsSnapshot(asPrisma(prisma), "company-1", entry);

    const call = prisma.upsertCalls[0] as { create: { interestIncome: string | null } };
    expect(call.create.interestIncome).toBe("0");
  });

  it("passes null through untouched for a missing financial field", async () => {
    const prisma = new FakePrisma();

    await writeFundamentalsSnapshot(asPrisma(prisma), "company-1", {
      ...entry,
      revenue: null,
    });

    const call = prisma.upsertCalls[0] as { create: { revenue: string | null } };
    expect(call.create.revenue).toBeNull();
  });
});
