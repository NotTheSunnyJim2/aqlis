import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { CompanyRegistry } from "../src/consumers/company-registry.js";

/** Structural fake: only the surface CompanyRegistry touches. */
class FakePrisma {
  constructor(public companies: { id: string; symbol: string }[]) {}
  company = {
    findMany: () => Promise.resolve(this.companies),
  };
}

const asPrisma = (fake: FakePrisma): PrismaClient => fake as unknown as PrismaClient;

describe("CompanyRegistry", () => {
  it("resolves a known symbol to its id after loading", async () => {
    const prisma = new FakePrisma([{ id: "c1", symbol: "AAPL" }]);
    const registry = new CompanyRegistry(asPrisma(prisma));

    await registry.load();

    expect(registry.resolve("AAPL")).toBe("c1");
    expect(registry.size).toBe(1);
  });

  it("returns undefined for a symbol that was never seeded", async () => {
    const prisma = new FakePrisma([{ id: "c1", symbol: "AAPL" }]);
    const registry = new CompanyRegistry(asPrisma(prisma));

    await registry.load();

    expect(registry.resolve("ZZZZ")).toBeUndefined();
  });

  it("replaces the cache on a second load rather than accumulating", async () => {
    const prisma = new FakePrisma([{ id: "c1", symbol: "AAPL" }]);
    const registry = new CompanyRegistry(asPrisma(prisma));
    await registry.load();

    prisma.companies = [{ id: "c2", symbol: "MSFT" }];
    await registry.load();

    expect(registry.resolve("AAPL")).toBeUndefined();
    expect(registry.resolve("MSFT")).toBe("c2");
    expect(registry.size).toBe(1);
  });
});
