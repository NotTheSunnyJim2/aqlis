# ADR 002 — Shariah screening methodology

Date: 2026-07-29
Status: Accepted

## Context

Aqlis needs a rules-based Shariah compliance screen. The ratios and
thresholds implemented here follow a published index methodology — an
educational implementation of that methodology, not a personal
religious ruling (see README disclaimer). Several published
methodologies exist (AAOIFI Standard 21, S&P Dow Jones Islamic Market
Indices, MSCI Islamic Index Series); they agree on the broad shape but
differ on exact thresholds and denominators.

## Decision

Implement against the **S&P Dow Jones Islamic Market Indices
Methodology**, S&P Dow Jones Indices LLC, current edition (February
2026):
https://www.spglobal.com/spdji/en/documents/methodologies/methodology-dj-islamic-market-indices.pdf

Two gates, both must pass:

1. **Business activity exclusion** — categorical. A company whose core
   business is conventional (interest-based) financial services,
   gambling, alcohol, tobacco, pork, weapons/defense manufacturing, or
   adult entertainment fails outright, regardless of financial ratios.
   Classified by `Company.industry` (fine-grained), not `sector`
   (too coarse — see prisma/seed.ts).
2. **Financial ratios** — three ratios, each capped at **33%** of
   market capitalization: total debt; cash + interest-bearing
   securities; accounts receivable. Plus a fourth, separate threshold:
   total non-compliant income (impermissible activity + interest
   income) capped at **5%** of revenue — this number also drives the
   Phase 11 purification calculator.

## Rationale

DJIM was chosen over AAOIFI/MSCI as the primary cited source because
it's a single, coherent, actively-maintained, publicly verifiable
document with a stable URL — the project cites ONE real methodology
faithfully rather than blending several, which would make no single
citation fully honest.

## Deviation from the source (approved)

**The source methodology uses a 24-month TRAILING AVERAGE market
capitalization as the ratio denominator; Aqlis uses SPOT market
capitalization (live price × diluted shares outstanding) instead.**

This is deliberate, not an oversight. S&P uses a trailing average to
reduce index turnover — a real fund shouldn't flip a holding in and
out of an index on daily price noise. But Aqlis's entire purpose,
established from Phase 0, is to make LIVE compliance drift visible: a
permissible business (e.g. a debt-heavy telecom) can drift into
non-compliance purely because its share price fell. A 24-month rolling
average would barely move day to day, making that story — the reason
this project exists — nearly impossible to observe in any demo or
interview timeframe.

Consequence, stated plainly in the README: Aqlis's verdicts are MORE
volatile than a real index provider's, by design. This tool is a live
monitoring and educational instrument, not an index-membership-grade
product.

## Known simplifications (documented, not silent)

- **Weapons/defense**: the source screens by REVENUE PERCENTAGE from
  defense activity (a mixed civilian/defense aerospace firm is judged
  on its mix). Aqlis classifies by `industry` string instead, since
  FMP doesn't expose a revenue-mix breakdown — correct for a pure-play
  defense contractor, imprecise for a mixed one.
- **Broader "impure entertainment"** (cinema, music, hotels) — present
  in the source's exclusion list but deliberately OUT of scope here:
  the most debated, inconsistently-applied category across Shariah
  boards and index providers, and not represented in the current
  watchlist. Logged as a deferred item, not silently dropped.
- **Non-compliant income ratio** covers interest income only, not
  non-compliant business-activity revenue (e.g. a mostly-clean company
  with a small casino-floor revenue line) — again, no revenue-mix data
  available from FMP.

## Alternatives considered

- **AAOIFI Standard 21** — arguably the most authoritative Islamic
  finance standards body (vs. a commercial index provider), uses 30%
  thresholds instead of 33%. Considered as the primary source; DJIM
  chosen instead for having a single clean document with a verifiable
  current URL, and being the more widely recognized name.
- **MSCI Islamic Index Series** — real, well-documented, but adds
  complexity we don't need: two index-series variants with different
  denominators (total assets vs. 36-month average market cap), plus
  entry/exit hysteresis bands (30% / 33.33% / 35%) to reduce
  flip-flopping at the threshold. That hysteresis idea is genuinely
  useful and may be borrowed for the Phase 10 drift detector — cited
  separately there if adopted, not blended into this screen's
  thresholds.
- **Faithful trailing-average market cap** — see deviation above.

## Consequences

- Easier: a live, interactive drift story that mirrors the project's
  entire premise; every screen result is independently nullable, so
  missing data produces an honest UNKNOWN verdict rather than a
  fabricated pass — enforced by the verdict combiner's precedence
  rules (confirmed failure > unknown > compliant), unit tested
  explicitly (tests/verdict.test.ts).
- Harder: Aqlis's verdicts cannot be presented as index-membership-
  grade; documented explicitly in the README and here.
- A real regex-boundary bug (`\bbank\b` failing to match "Banks") was
  caught by the test suite before ever touching real data — the
  business-activity screen now uses lowercase substring matching on
  keyword stems instead of boundary-anchored regexes, precisely
  because real industry names are inflected (see
  business-activity-screen.ts).

## References

- S&P Dow Jones Islamic Market Indices Methodology (Feb 2026):
  https://www.spglobal.com/spdji/en/documents/methodologies/methodology-dj-islamic-market-indices.pdf
- AAOIFI Shariah Standard No. 21 (referenced for comparison)
- MSCI Islamic Index Series Methodology, May 2025:
  https://www.msci.com/documents/10199/8a59e89f-5134-de21-6a03-082ecfaa9e42
