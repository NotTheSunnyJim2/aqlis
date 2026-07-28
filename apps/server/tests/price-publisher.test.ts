import { describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { PricePublisher, PRICES_STREAM_KEY } from "../src/ingestion/price-publisher.js";
import type { BufferedPrice } from "../src/ingestion/price-buffer.js";

/**
 * A minimal stand-in for ioredis's pipeline: records every xadd call so
 * tests can assert exactly what would be sent, and returns configurable
 * [error, result] tuples from exec (mirroring the real pipeline shape).
 */
class FakePipeline {
  readonly calls: unknown[][] = [];
  constructor(private readonly execResult: [Error | null, unknown][] | null = null) {}

  xadd(...args: unknown[]): this {
    this.calls.push(args);
    return this;
  }

  exec(): Promise<[Error | null, unknown][] | null> {
    return Promise.resolve(this.execResult ?? this.calls.map(() => [null, "1-0"]));
  }
}

class FakeRedis {
  readonly pipelines: FakePipeline[] = [];
  constructor(private readonly execResult: [Error | null, unknown][] | null = null) {}

  pipeline(): FakePipeline {
    const pipeline = new FakePipeline(this.execResult);
    this.pipelines.push(pipeline);
    return pipeline;
  }
}

// The fake only implements the surface PricePublisher touches; the cast
// is localised here, at the test boundary, and nowhere in production.
const asRedis = (fake: FakeRedis): Redis => fake as unknown as Redis;

const price = (symbol: string, value: number, iso: string): BufferedPrice => ({
  symbol,
  price: value,
  observedAt: new Date(iso),
});

describe("PricePublisher", () => {
  it("writes nothing — and opens no pipeline — for an empty batch", async () => {
    const redis = new FakeRedis();
    const publisher = new PricePublisher(asRedis(redis));

    const written = await publisher.publish([]);

    expect(written).toBe(0);
    expect(redis.pipelines).toHaveLength(0);
  });

  it("appends one stream entry per price and reports the count", async () => {
    const redis = new FakeRedis();
    const publisher = new PricePublisher(asRedis(redis));

    const written = await publisher.publish([
      price("AAPL", 195.2, "2026-07-10T14:30:00Z"),
      price("MSFT", 410.5, "2026-07-10T14:30:01Z"),
    ]);

    expect(written).toBe(2);
    expect(redis.pipelines[0]?.calls).toHaveLength(2);
  });

  it("encodes an entry with string fields and epoch-millis event time", async () => {
    const redis = new FakeRedis();
    const publisher = new PricePublisher(asRedis(redis));
    const observedAt = new Date("2026-07-10T14:30:00Z");

    await publisher.publish([price("AAPL", 195.2, observedAt.toISOString())]);

    expect(redis.pipelines[0]?.calls[0]).toEqual([
      PRICES_STREAM_KEY,
      "MAXLEN",
      "~",
      10_000,
      "*",
      "symbol",
      "AAPL",
      "price",
      "195.2",
      "observedAt",
      observedAt.getTime().toString(),
    ]);
  });

  it("throws if any pipelined command failed", async () => {
    const redis = new FakeRedis([[new Error("boom"), null]]);
    const publisher = new PricePublisher(asRedis(redis));

    await expect(publisher.publish([price("AAPL", 195.2, "2026-07-10T14:30:00Z")])).rejects.toThrow(
      "boom",
    );
  });
});
