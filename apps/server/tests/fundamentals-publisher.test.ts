import { describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import {
  FundamentalsPublisher,
  FUNDAMENTALS_STREAM_KEY,
} from "../src/ingestion/fundamentals-publisher.js";
import type { ParsedFundamentals } from "../src/ingestion/fmp-fundamentals.js";

/**
 * A minimal in-memory Redis stand-in: a hash map for hget/hset, a
 * pipeline that records xadd/hset calls. Enough surface for
 * FundamentalsPublisher, nothing more — see the price-publisher tests
 * for the same "structural fake, not a mocking framework" pattern.
 */
class FakePipeline {
  readonly xaddCalls: unknown[][] = [];
  readonly hsetCalls: unknown[][] = [];
  constructor(private readonly hash: Map<string, string>) {}

  xadd(...args: unknown[]): this {
    this.xaddCalls.push(args);
    return this;
  }
  hset(key: string, field: string, value: string): this {
    this.hsetCalls.push([key, field, value]);
    this.hash.set(field, value);
    return this;
  }
  exec(): Promise<[Error | null, unknown][]> {
    return Promise.resolve([...this.xaddCalls, ...this.hsetCalls].map(() => [null, "ok"]));
  }
}

class FakeRedis {
  private readonly hash = new Map<string, string>();
  readonly pipelines: FakePipeline[] = [];

  hget(_key: string, field: string): Promise<string | null> {
    return Promise.resolve(this.hash.get(field) ?? null);
  }
  pipeline(): FakePipeline {
    const p = new FakePipeline(this.hash);
    this.pipelines.push(p);
    return p;
  }
}

const asRedis = (fake: FakeRedis): Redis => fake as unknown as Redis;

const snapshot = (acceptedAt: string, overrides: Partial<ParsedFundamentals> = {}): ParsedFundamentals => ({
  symbol: "AAPL",
  periodEndDate: new Date("2026-03-28"),
  period: "Q2",
  fiscalYear: "2026",
  acceptedAt: new Date(acceptedAt),
  reportedCurrency: "USD",
  totalDebt: 84711000000,
  cashAndShortTermInvestments: 68507000000,
  netReceivables: 53511000000,
  totalAssets: 371082000000,
  revenue: 111184000000,
  interestIncome: 0,
  sharesOutstanding: 14768115000,
  ...overrides,
});

describe("FundamentalsPublisher", () => {
  it("publishes a snapshot never seen before for this symbol", async () => {
    const redis = new FakeRedis();
    const publisher = new FundamentalsPublisher(asRedis(redis));

    const published = await publisher.publishIfNew(snapshot("2026-05-01T10:01:00"));

    expect(published).toBe(true);
    expect(redis.pipelines[0]?.xaddCalls[0]?.[0]).toBe(FUNDAMENTALS_STREAM_KEY);
  });

  it("skips a snapshot with the same acceptedAt as last time (duplicate poll)", async () => {
    const redis = new FakeRedis();
    const publisher = new FundamentalsPublisher(asRedis(redis));

    await publisher.publishIfNew(snapshot("2026-05-01T10:01:00"));
    const secondPoll = await publisher.publishIfNew(snapshot("2026-05-01T10:01:00"));

    expect(secondPoll).toBe(false);
    expect(redis.pipelines).toHaveLength(1); // no second pipeline was opened
  });

  it("publishes again when a genuinely newer filing arrives", async () => {
    const redis = new FakeRedis();
    const publisher = new FundamentalsPublisher(asRedis(redis));

    await publisher.publishIfNew(snapshot("2026-05-01T10:01:00"));
    const nextQuarter = await publisher.publishIfNew(snapshot("2026-08-01T10:01:00"));

    expect(nextQuarter).toBe(true);
    expect(redis.pipelines).toHaveLength(2);
  });

  it("encodes a null financial field as the literal string \"null\"", async () => {
    const redis = new FakeRedis();
    const publisher = new FundamentalsPublisher(asRedis(redis));

    await publisher.publishIfNew(snapshot("2026-05-01T10:01:00", { interestIncome: null }));

    const call = redis.pipelines[0]?.xaddCalls[0] ?? [];
    const idx = call.indexOf("interestIncome");
    expect(call[idx + 1]).toBe("null");
  });

  it("preserves a real zero distinctly from null", async () => {
    const redis = new FakeRedis();
    const publisher = new FundamentalsPublisher(asRedis(redis));

    await publisher.publishIfNew(snapshot("2026-05-01T10:01:00", { interestIncome: 0 }));

    const call = redis.pipelines[0]?.xaddCalls[0] ?? [];
    const idx = call.indexOf("interestIncome");
    expect(call[idx + 1]).toBe("0");
  });
});
