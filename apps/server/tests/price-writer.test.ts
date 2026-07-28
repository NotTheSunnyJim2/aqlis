import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { writePriceSnapshot } from "../src/consumers/price-writer.js";
import type { PriceStreamEntry } from "../src/consumers/price-entry.js";

class FakePrisma {
  readonly upsertCalls: unknown[] = [];
  priceSnapshot = {
    upsert: (args: unknown) => {
      this.upsertCalls.push(args);
      return Promise.resolve({});
    },
  };
}

const asPrisma = (fake: FakePrisma): PrismaClient => fake as unknown as PrismaClient;

describe("writePriceSnapshot", () => {
  it("upserts on (companyId, observedAt), passing price through as a string", async () => {
    const prisma = new FakePrisma();
    const entry: PriceStreamEntry = {
      symbol: "AAPL",
      price: "195.2",
      observedAt: new Date(1720621800123),
    };

    await writePriceSnapshot(asPrisma(prisma), "company-1", entry);

    expect(prisma.upsertCalls).toEqual([
      {
        where: {
          companyId_observedAt: { companyId: "company-1", observedAt: entry.observedAt },
        },
        update: {},
        create: {
          companyId: "company-1",
          price: "195.2",
          observedAt: entry.observedAt,
        },
      },
    ]);
  });
});
