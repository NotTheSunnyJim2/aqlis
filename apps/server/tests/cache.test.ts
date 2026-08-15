import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached } from "../src/cache.js";

describe("cached", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("only calls the underlying function once within the TTL window", async () => {
    let calls = 0;
    const fn = cached(() => {
      calls++;
      return Promise.resolve("value");
    }, 1000);

    await fn();
    await fn();
    await fn();

    expect(calls).toBe(1);
  });

  it("re-invokes the underlying function once the TTL expires", async () => {
    let calls = 0;
    const fn = cached(() => {
      calls++;
      return Promise.resolve(calls);
    }, 1000);

    expect(await fn()).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(await fn()).toBe(2);
  });

  it("returns the exact cached value, not a re-derived one", async () => {
    const fn = cached(() => Promise.resolve({ status: "ok", uptime: Math.random() }), 1000);

    const first = await fn();
    const second = await fn();

    expect(second).toBe(first); // same object reference — truly cached
  });

  it("caches a falsy/failure result too, not just successes", async () => {
    let calls = 0;
    const fn = cached(() => {
      calls++;
      return Promise.resolve(false);
    }, 1000);

    await fn();
    await fn();

    expect(calls).toBe(1);
  });
});
