import type { PrismaClient } from "../generated/prisma/client.js";
import type { FundamentalsStreamEntry } from "./fundamentals-entry.js";

/** Writes one fundamentals snapshot. Same upsert-for-redelivery-safety
 * reasoning as writePriceSnapshot — see there. */
export async function writeFundamentalsSnapshot(
  prisma: PrismaClient,
  companyId: string,
  entry: FundamentalsStreamEntry,
): Promise<void> {
  await prisma.fundamentalsSnapshot.upsert({
    where: {
      companyId_periodEndDate_period: {
        companyId,
        periodEndDate: entry.periodEndDate,
        period: entry.period,
      },
    },
    update: {},
    create: {
      companyId,
      periodEndDate: entry.periodEndDate,
      period: entry.period,
      fiscalYear: entry.fiscalYear,
      acceptedAt: entry.acceptedAt,
      reportedCurrency: entry.reportedCurrency,
      totalDebt: entry.totalDebt,
      cashAndShortTermInvestments: entry.cashAndShortTermInvestments,
      netReceivables: entry.netReceivables,
      totalAssets: entry.totalAssets,
      revenue: entry.revenue,
      interestIncome: entry.interestIncome,
      sharesOutstanding: entry.sharesOutstanding,
    },
  });
}
