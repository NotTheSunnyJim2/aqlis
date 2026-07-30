/**
 * Standard normal (mean 0, stdev 1) draw via the Box-Muller transform —
 * turns two independent Uniform(0,1) draws into one Normal(0,1) draw.
 * `randomFn` defaults to Math.random but is injectable so simulations
 * are deterministic and assertable in tests (same DI pattern as every
 * other randomness/I/O boundary in this codebase — WebSocketImpl,
 * fetchImpl, etc.).
 */
export function randomNormal(randomFn: () => number = Math.random): number {
  // u1 = 0 would make Math.log(u1) = -Infinity; redraw rather than let
  // one in ~2^53 calls produce a NaN downstream.
  let u1 = 0;
  while (u1 === 0) u1 = randomFn();
  const u2 = randomFn();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
