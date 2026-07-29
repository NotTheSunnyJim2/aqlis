import type { PrismaClient } from "../generated/prisma/client.js";
import type { CompanyRegistry } from "./company-registry.js";
import type { Logger } from "../logger.js";
import { computeVerdict } from "../screening/verdict.js";
import { detectDrift, type DriftComparableVerdict } from "../screening/drift.js";
import { decimalToNumber } from "../decimal.js";

/**
 * Recomputes and persists a verdict for one company, using its LATEST
 * known price and fundamentals snapshots — triggered after EITHER a
 * price or a fundamentals write, since either can change the outcome
 * (a price move alone can shift market cap and every ratio derived
 * from it; a new filing changes the ratios directly).
 *
 * Compares the new verdict against the immediately-previous one for
 * this company and records any drift as DriftAlert rows. A company's
 * first-ever verdict produces no drift events (detectDrift(null, ...)
 * returns []) — there's nothing to have drifted from.
 */
export async function recordVerdict(
  prisma: PrismaClient,
  registry: CompanyRegistry,
  symbol: string,
  logger: Logger,
): Promise<void> {
  const company = registry.get(symbol);
  if (!company) {
    logger.warn({ symbol }, "cannot record verdict — unknown symbol");
    return;
  }

  const [latestPrice, latestFundamentals, previousVerdict] = await Promise.all([
    prisma.priceSnapshot.findFirst({
      where: { companyId: company.id },
      orderBy: { observedAt: "desc" },
    }),
    // Point-in-time rule (see schema.prisma FundamentalsSnapshot):
    // never use a filing before it was actually accepted/public.
    prisma.fundamentalsSnapshot.findFirst({
      where: { companyId: company.id, acceptedAt: { lte: new Date() } },
      orderBy: { acceptedAt: "desc" },
    }),
    prisma.complianceVerdict.findFirst({
      where: { companyId: company.id },
      orderBy: { computedAt: "desc" },
    }),
  ]);

  const verdict = computeVerdict({
    sector: company.sector,
    industry: company.industry,
    price: decimalToNumber(latestPrice?.price),
    sharesOutstanding: decimalToNumber(latestFundamentals?.sharesOutstanding),
    totalDebt: decimalToNumber(latestFundamentals?.totalDebt),
    cashAndShortTermInvestments: decimalToNumber(latestFundamentals?.cashAndShortTermInvestments),
    netReceivables: decimalToNumber(latestFundamentals?.netReceivables),
    revenue: decimalToNumber(latestFundamentals?.revenue),
    interestIncome: decimalToNumber(latestFundamentals?.interestIncome),
  });

  const newVerdict = await prisma.complianceVerdict.create({
    data: {
      companyId: company.id,
      status: verdict.status,
      reasons: verdict.reasons,
      priceSnapshotId: latestPrice?.id,
      fundamentalsSnapshotId: latestFundamentals?.id,
      marketCap: verdict.marketCap,
      debtRatio: verdict.debtRatio,
      cashRatio: verdict.cashRatio,
      receivablesRatio: verdict.receivablesRatio,
      nonCompliantIncomeRatio: verdict.nonCompliantIncomeRatio,
      businessActivityPass: verdict.businessActivityPass,
    },
  });

  const previousComparable: DriftComparableVerdict | null = previousVerdict && {
    status: previousVerdict.status,
    debtRatio: decimalToNumber(previousVerdict.debtRatio),
    cashRatio: decimalToNumber(previousVerdict.cashRatio),
    receivablesRatio: decimalToNumber(previousVerdict.receivablesRatio),
    nonCompliantIncomeRatio: decimalToNumber(previousVerdict.nonCompliantIncomeRatio),
  };

  const currentComparable: DriftComparableVerdict = {
    status: verdict.status,
    debtRatio: verdict.debtRatio,
    cashRatio: verdict.cashRatio,
    receivablesRatio: verdict.receivablesRatio,
    nonCompliantIncomeRatio: verdict.nonCompliantIncomeRatio,
  };

  const events = detectDrift(previousComparable, currentComparable);

  // events is only ever non-empty when previousVerdict exists (see
  // detectDrift's null-previous short-circuit) — the `if` here narrows
  // previousVerdict for TypeScript rather than asserting it.
  if (previousVerdict && events.length > 0) {
    for (const event of events) {
      await prisma.driftAlert.create({
        data: {
          companyId: company.id,
          type: event.type,
          fromVerdictId: previousVerdict.id,
          toVerdictId: newVerdict.id,
          ratio: event.ratio,
          previousValue: event.previousValue,
          currentValue: event.currentValue,
          threshold: event.threshold,
        },
      });
      logger.info({ symbol, type: event.type, ratio: event.ratio }, "compliance drift detected");
    }
  }

  logger.info({ symbol, status: verdict.status }, "verdict recorded");
}
