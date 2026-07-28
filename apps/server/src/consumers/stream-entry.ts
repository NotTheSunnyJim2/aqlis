/**
 * Redis Streams deliver each entry's fields as a flat array —
 * [key1, value1, key2, value2, ...] — the same shape you saw with
 * XRANGE in the Phase 6 hands-on session. Convert to a plain record so
 * the specific parsers (price/fundamentals) can access fields by name.
 */
export function fieldsToRecord(fields: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i < fields.length - 1; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (key !== undefined && value !== undefined) {
      record[key] = value;
    }
  }
  return record;
}
