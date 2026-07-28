import type { PrismaClient } from "../generated/prisma/client.js";
import type { PriceStreamEntry } from "./price-entry.js";

/**
 * Writes one price snapshot, keyed by the same (companyId, observedAt)
 * pair the schema's unique constraint enforces (see ADR / schema.prisma
 * PriceSnapshot). `upsert` makes this safe to call twice for the same
 * entry — the exact situation a redelivered-but-already-handled stream
 * entry produces (e.g. the consumer wrote the row, then crashed before
 * XACK; on restart, the SAME entry is redelivered).
 */
export async function writePriceSnapshot(
  prisma: PrismaClient,
  companyId: string,
  entry: PriceStreamEntry,
): Promise<void> {
  await prisma.priceSnapshot.upsert({
    where: {
      companyId_observedAt: { companyId, observedAt: entry.observedAt },
    },
    // Same (companyId, observedAt) means identical source data —
    // nothing to change on a redelivery.
    update: {},
    create: {
      companyId,
      price: entry.price,
      observedAt: entry.observedAt,
    },
  });
}
