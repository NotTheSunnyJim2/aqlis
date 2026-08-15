/**
 * Wraps an async function with a TTL cache — the first call runs `fn`
 * and caches the result; subsequent calls within `ttlMs` return the
 * cached value without re-invoking `fn`. Built for health checks that
 * get polled far more often than the underlying dependency actually
 * needs to be touched (see index.ts's checkDatabase/checkRedis — Fly
 * polls every 15s, but hitting Neon that often keeps its compute
 * "active" and prevents its 5-minute autosuspend from ever firing).
 */
export function cached<T>(fn: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let cache: { value: T; expiresAt: number } | undefined;
  return async () => {
    if (cache && Date.now() < cache.expiresAt) {
      return cache.value;
    }
    const value = await fn();
    cache = { value, expiresAt: Date.now() + ttlMs };
    return value;
  };
}
