/** Minimal structural logger; a pino instance satisfies this. Any
 * component that only needs to log — not pino's full API — should
 * depend on this shape instead of importing pino directly. */
export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
}
