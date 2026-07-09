# Aqlis

Live Shariah stock-screening dashboard. Aqlis ingests real-time prices and
quarterly fundamentals for a watchlist of companies, runs a rules-based
Shariah compliance screen on each, detects when a stock drifts in or out of
compliance, calculates the purification amount for non-compliant income,
and streams all of it to a live dashboard over WebSockets.

> **Important:** the screening ratios and thresholds implemented here follow
> a published index methodology (source cited in
> [docs/adr](docs/adr/) once implemented — see Phase 9). This project is an
> educational implementation of that methodology, **not** a religious ruling.
> Consult a qualified scholar for personal rulings.

## Why I built it

Two reasons, one personal and one technical.

Personal: Shariah compliance screening is usually a paid, black-box service.
I wanted to understand the actual rules: what makes a stock compliant, why a
compliant stock can silently become non-compliant when its price moves, and
how purification is calculated — deeply enough to implement them.

Technical: The problem forces a genuinely interesting pipeline. Prices tick
in sub-second; fundamentals change quarterly. Joining two feeds with wildly
different cadences into one live, correct verdict is a real systems-design
problem — queues, consumers, threshold detection, and push delivery — at a
scale one person can build and defend end to end.

## Tech decisions

Every non-trivial choice has an Architecture Decision Record in
[docs/adr](docs/adr/). Start with
[ADR-001: tech stack](docs/adr/001-tech-stack.md).

## How to run

> Not yet runnable — the backend skeleton lands in Phase 5. This section is
> updated as each piece ships.

```bash
cp .env.example apps/server/.env   # then fill in your own credentials
```

## How to test

> Test harness arrives with the scaffold; suites grow alongside each feature.

```bash
npm test
```
