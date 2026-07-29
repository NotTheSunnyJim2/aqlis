/**
 * Prisma returns Decimal instances (from decimal.js) for Decimal
 * columns, not plain numbers. Structural typing here accepts anything
 * with `.toNumber()` without importing Prisma's Decimal class
 * directly.
 */
export function decimalToNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}
