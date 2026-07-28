import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

/**
 * Constructs a PrismaClient for a given connection string.
 *
 * Prisma 7 removed its built-in query engine binary — the classic
 * "wrong engine for this platform" failure mode is gone — in favor of
 * driver adapters: thin wrappers around a real Node DB driver (`pg`
 * here) that Prisma's TypeScript query compiler talks to directly.
 * `new PrismaClient()` with no arguments now throws; every caller must
 * construct and pass its own adapter.
 *
 * Takes the URL as a parameter (not read from process.env internally)
 * so every caller goes through the same validated AppConfig — same
 * "parse once, inject everywhere" discipline as the rest of the app.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
