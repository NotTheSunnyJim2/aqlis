# ADR 001 — Tech stack for Aqlis

Date: 2026-07-09
Status: Accepted

## Context

Aqlis joins two data feeds with very different cadences — sub-second price
ticks and quarterly fundamentals — into live Shariah-compliance verdicts
pushed to a dashboard. It is a solo portfolio project: every choice must be
(a) defensible in a technical interview, (b) runnable on free or near-free
tiers, and (c) teach a transferable industry pattern rather than a
framework-specific trick.

## Decision

Node.js 22 (LTS) + TypeScript + Fastify backend; Finnhub (real-time prices,
WebSocket) and Financial Modeling Prep (quarterly fundamentals, REST) as
data providers; Upstash Redis Streams as the ingestion queue; Neon
serverless Postgres with Prisma for storage and migrations; native `ws`
WebSockets to the browser; React + Vite + Tailwind frontend; Fly.io for
deployment (Docker, Terraform-managed); GitHub Actions for CI; Vitest,
Supertest, Playwright and k6 for the test pyramid; pino for structured logs.

## Rationale

- **Queue-centred design**: ingestion writes to Redis Streams, consumers
  drain to Postgres. Buys backpressure absorption, producer/consumer
  decoupling, and replay — the log-based messaging pattern (Kafka's mental
  model) at free-tier scale.
- **Two providers is the realistic version of the problem**: no single free
  API offers both streaming quotes and statement-level fundamentals, and
  joining feeds with different owners, shapes, and cadences is exactly the
  systems problem worth demonstrating.
- **Postgres because the data is relational**: companies → snapshots →
  verdicts → alerts, queried by joins. Neon adds branching (safe migration
  testing) on a free tier.
- **Raw `ws` over Socket.IO deliberately**: the point is to learn the
  protocol — upgrade handshake, heartbeats, reconnection — not to hide it.
- **Free-tier quotas shaped the design**: Upstash's 500K commands/month and
  Neon's 100 CU-hours/month force windowed batching of price ticks rather
  than per-tick writes. Verified before signup (2026-07): FMP free tier
  serves quarterly statements via the `/stable/` API; Finnhub free tier
  streams US trades for up to 50 symbols.

## Alternatives considered

- **Kafka (self-hosted or managed)** — the industry standard the Streams
  choice imitates; rejected: self-hosting is an ops project of its own, no
  meaningful managed free tier.
- **Redis Pub/Sub** — no persistence, no consumer groups; a slow consumer
  silently drops messages, defeating the purpose of a queue.
- **Socket.IO** — production-sensible but hides the WebSocket protocol this
  project intends to teach.
- **Single data provider** — simpler, but erases the two-cadence join that
  makes the pipeline worth building.
- **AWS deployment** — stronger CV keyword, but ~4× the infra ceremony
  (IAM/VPC/ECS) would crowd out the screening engine, and free credits
  expire mid-project. Planned instead as a later scoped migration
  (Fly → ECS, ~spring 2027).
- **NoSQL (e.g. DynamoDB/Mongo)** — the access patterns are joins over
  normalised entities; document stores add impedance, not value, here.

## Consequences

- Easier: burst absorption, replaying ingestion after consumer bugs, safe
  schema evolution (Neon branches + Prisma migrations), interview-ready
  narrative for every layer.
- Harder: two providers mean two failure modes, two rate-limit budgets, and
  normalisation code; raw `ws` means hand-rolling reconnection/heartbeats;
  free-tier quotas impose windowed (15–30s) price granularity rather than
  true tick-level storage — acceptable because compliance verdicts, not
  microstructure, are the product.
- Costs: everything free except Fly.io (~£1–3/month from first deploy).

## References

- Upstash pricing/limits: https://upstash.com/docs/redis/overall/pricing
- Neon plans: https://neon.com/docs/introduction/plans
- Finnhub API docs: https://finnhub.io/docs/api
- FMP stable API docs: https://site.financialmodelingprep.com/developer/docs
- Fly.io pricing: https://fly.io/docs/about/pricing/
