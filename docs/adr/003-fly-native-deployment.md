# ADR 003 — Fly-native deployment, superseding Terraform

Date: 2026-07-30
Status: Accepted
Supersedes: the "Terraform-managed" clause of [ADR-001](001-tech-stack.md)

## Context

ADR-001 (2026-07-09) chose Fly.io for deployment with Terraform managing
its resources — a defensible choice at the time, matching the project's
own Redis-Streams-as-Kafka pattern of picking a real industry tool over a
platform-specific shortcut. By the time Phase 16 (infra-as-code) actually
started, Fly.io had discontinued its official Terraform provider. Per
Fly's own docs: "We don't have a Terraform provider anymore, and that's
intentional... Terraform was always working at a bit of a mismatch since
it tries to express an inherently imperative lifecycle in a declarative
model" — Fly's Machines API is fundamentally imperative (create a
machine, update it in place, restart it), which Terraform's declarative
plan/apply model fights rather than fits.

ADR-001 is left as written, recording what was true and decided on
2026-07-09 — an ADR is a record of a decision at a point in time, not a
living document to be silently edited when circumstances change. This
ADR documents the actual pivot and supersedes that one clause.

## Decision

Replace Terraform with Fly-native infrastructure-as-code: a single
`fly.toml` (app config, process groups, health checks, VM sizing) plus a
multi-stage `Dockerfile`, deployed via `flyctl` and (for CI, deferred
where relevant) GitHub Actions — Fly's own current recommendation.

One Fly app, four process groups sharing one Docker image (`api`,
`worker-price`, `worker-fundamentals`, `worker-consumer`) rather than
four separate Fly apps — they share one codebase and one deploy
lifecycle, and Fly's process-group model exists specifically for this
shape.

`min_machines_running = 1` for the `api` process group — a deliberate
departure from Fly's own scale-to-zero default. This project exists to
be clicked on cold by a hiring manager; a multi-second cold start on
first load is a worse first impression than the marginal always-on cost
(already budgeted in ADR-001's ~£1–3/month estimate).

## Alternatives considered

- **Community-maintained Terraform forks** (e.g. `pi3ch/fly`,
  `DAlperin/fly-io` on the Terraform Registry) — real options, but adding
  a third-party provider for a platform whose own vendor has explicitly
  stepped back from Terraform trades one problem (no official IaC) for a
  worse one (an unofficial provider with no guaranteed lifecycle,
  defended in an interview as "I depend on a fork with no SLA").
- **Machines API directly** (lower-level than `flyctl`, imperative HTTP
  calls to create/update machines) — the actual substrate `flyctl` itself
  is built on; rejected here as unnecessary ceremony for a project this
  size, though it's the natural next layer down if finer control were
  ever needed.
- **Four separate Fly apps** (one per process) instead of one app with
  four process groups — simpler mental model, but means four sets of
  secrets to keep in sync, four DNS/health-check configs, and loses the
  single-deploy-lifecycle property that matches how this codebase
  actually ships (one image, one release).

## Consequences

- Easier: `fly.toml` is genuinely simpler than the Terraform HCL it
  replaces — no separate state file to manage, no provider version
  pinning, and it doubles as living documentation of the deployed
  topology (process groups, health checks, VM sizing all in one
  readable file).
- Harder: process-group secrets are app-wide, not scoped per group — the
  `api` process still receives `FINNHUB_API_KEY`/`FMP_API_KEY` it never
  uses. A real fix needs a per-entrypoint config split (application-code
  change, deliberately kept out of this infra-focused ADR/phase).
- A real surprise found only at deploy time, not designed around in
  advance: `min_machines_running = 1` still triggers Fly's own default
  "second machine for zero-downtime deploys" behavior, so `api` runs 2
  machines rather than 1 — accepted as a reasonable trade (real
  zero-downtime deploys, small extra cost) rather than forced down to 1.

## References

- Fly.io, "Building Infrastructure Automation without Terraform":
  https://fly.io/docs/blueprints/infra-automation-without-terraform/
- Fly.io Machines API: https://fly.io/docs/machines/
- Fly.io fly.toml reference: https://fly.io/docs/reference/configuration/
