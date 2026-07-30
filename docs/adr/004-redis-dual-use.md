# ADR 004 — One Redis instance, two messaging patterns

Date: 2026-07-29
Status: Accepted

## Context

ADR-001 rejected Redis Pub/Sub as the *ingestion* queue: no persistence,
no consumer groups, a slow or restarting consumer silently loses whatever
was published while it was down — unacceptable for price/fundamentals
data that must not be dropped. Streams (with consumer groups, XREADGROUP,
XACK) was chosen instead specifically for that durability.

Phase 12 (the live WebSocket dashboard) then introduced Redis Pub/Sub
anyway — for a different purpose. Read literally next to each other,
ADR-001 and the Phase 12 code look contradictory: "Pub/Sub was rejected"
next to "Pub/Sub is used." This ADR exists to make the actual reasoning
explicit rather than leave that tension for a reader to puzzle out.

## Decision

Use Redis Streams for ingestion (Finnhub/FMP → workers → consumer →
Postgres) and Redis Pub/Sub for live dashboard fan-out (consumer →
connected browsers, over `/ws`) — the same Redis instance, two different
messaging primitives, chosen for two genuinely different delivery
guarantees:

- **Ingestion** needs *at-least-once, ordered, replayable* delivery — a
  dropped price tick or a crashed consumer must not silently lose data.
  This is what Streams' persistence and consumer-group redelivery buys.
- **Live UI push** needs *at-most-once, best-effort, no replay*
  delivery — a browser that misses a message just has slightly stale
  data until the next one arrives; it doesn't need history, it needs
  freshness. A disconnected client reconnects and re-fetches current
  state via the REST endpoints (Phase 11/13) rather than replaying
  missed events. Pub/Sub's lack of persistence is not a limitation here,
  it's the correct fit — nothing worth persisting, since a page refresh
  re-derives current state anyway.

## Alternatives considered

- **Streams for both** — technically possible (consumers could tail the
  same stream), but WebSocket clients aren't consumer-group members with
  persistent cursors; correctly wiring per-connection stream positions
  for a value that's thrown away on disconnect would be real complexity
  spent solving a problem that doesn't exist for this use case.
- **A second Redis instance, one per pattern** — no isolation benefit
  worth the extra free-tier resource (Upstash's own quota is
  command-count-based, not per-instance-scoped in a way that would
  change here) and doubles the connection/config surface for no gain.

## Consequences

- Easier: each pattern is used for exactly the guarantee it's good at,
  rather than one primitive stretched to cover both — a genuinely
  citable "same infrastructure, opposite delivery guarantees, matched to
  the actual requirement each time" story for an interview.
- Worth knowing: this means index.ts and consumer-worker.ts each hold
  more than one Redis connection with different roles (a Pub/Sub
  subscriber can't run other commands once subscribed, so it's always a
  dedicated connection, separate from the one used for normal commands)
  — a real Redis operational detail, not an accident of the code.

## References

- Redis Streams docs: https://redis.io/docs/latest/develop/data-types/streams/
- Redis Pub/Sub docs: https://redis.io/docs/latest/develop/interact/pubsub/
