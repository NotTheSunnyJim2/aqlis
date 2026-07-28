import { describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import type { Logger } from "../src/logger.js";
import { ensureConsumerGroup, processStreamEntry } from "../src/consumers/stream-consumer.js";

const noop = (): void => undefined;
const silentLogger: Logger = { info: noop, warn: noop, error: noop, debug: noop };

class FakeRedis {
  readonly xackCalls: unknown[][] = [];
  constructor(private readonly xgroupError: Error | null = null) {}

  xgroup(): Promise<unknown> {
    if (this.xgroupError) {
      return Promise.reject(this.xgroupError);
    }
    return Promise.resolve("OK");
  }

  xack(...args: unknown[]): Promise<number> {
    this.xackCalls.push(args);
    return Promise.resolve(1);
  }
}

const asRedis = (fake: FakeRedis): Redis => fake as unknown as Redis;

describe("ensureConsumerGroup", () => {
  it("succeeds when the group is created for the first time", async () => {
    const redis = new FakeRedis();
    await expect(ensureConsumerGroup(asRedis(redis), "stream", "group")).resolves.toBeUndefined();
  });

  it("swallows BUSYGROUP — the expected case on every restart", async () => {
    const redis = new FakeRedis(new Error("BUSYGROUP Consumer Group name already exists"));
    await expect(ensureConsumerGroup(asRedis(redis), "stream", "group")).resolves.toBeUndefined();
  });

  it("rethrows any other error", async () => {
    const redis = new FakeRedis(new Error("connection refused"));
    await expect(ensureConsumerGroup(asRedis(redis), "stream", "group")).rejects.toThrow(
      "connection refused",
    );
  });
});

describe("processStreamEntry", () => {
  it("acks after a successful handle", async () => {
    const redis = new FakeRedis();
    const handled: string[] = [];

    await processStreamEntry(
      asRedis(redis),
      "prices:stream",
      "consumers",
      "1-0",
      ["symbol", "AAPL"],
      (fields) => fields, // trivial parser: never null
      (entry) => {
        handled.push(entry.join(","));
        return Promise.resolve();
      },
      silentLogger,
    );

    expect(handled).toEqual(["symbol,AAPL"]);
    expect(redis.xackCalls).toEqual([["prices:stream", "consumers", "1-0"]]);
  });

  it("does NOT ack when the entry fails to parse", async () => {
    const redis = new FakeRedis();

    await processStreamEntry(
      asRedis(redis),
      "prices:stream",
      "consumers",
      "1-0",
      ["garbage"],
      () => null, // parser rejects this entry
      () => Promise.reject(new Error("should never be called")),
      silentLogger,
    );

    expect(redis.xackCalls).toHaveLength(0);
  });

  it("does NOT ack when the handler throws (e.g. a failed DB write)", async () => {
    const redis = new FakeRedis();

    await processStreamEntry(
      asRedis(redis),
      "prices:stream",
      "consumers",
      "1-0",
      ["symbol", "AAPL"],
      (fields) => fields,
      () => Promise.reject(new Error("db unreachable")),
      silentLogger,
    );

    expect(redis.xackCalls).toHaveLength(0);
  });
});
