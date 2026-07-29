import "dotenv/config";
import { Redis } from "ioredis";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPrismaClient } from "./db.js";
import { decimalToNumber } from "./decimal.js";

const config = loadConfig();
const prisma = createPrismaClient(config.databaseUrl);
// lazyConnect: don't open the socket until first use — /health (pure
// liveness) shouldn't require Redis to be reachable to answer.
const redis = new Redis(config.redisUrl, { lazyConnect: true });

const app = buildApp({
  logger:
    process.env.NODE_ENV === "production"
      ? true // raw JSON lines: logs are data in production
      : { transport: { target: "pino-pretty" } },
  checkDatabase: async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
  checkRedis: async () => {
    try {
      return (await redis.ping()) === "PONG";
    } catch {
      return false;
    }
  },
  lookupCompanyRatio: async (symbol) => {
    const company = await prisma.company.findUnique({ where: { symbol }, select: { id: true } });
    if (!company) {
      return { found: false, nonCompliantIncomeRatio: null };
    }
    const verdict = await prisma.complianceVerdict.findFirst({
      where: { companyId: company.id },
      orderBy: { computedAt: "desc" },
      select: { nonCompliantIncomeRatio: true },
    });
    return {
      found: true,
      nonCompliantIncomeRatio: decimalToNumber(verdict?.nonCompliantIncomeRatio),
    };
  },
});

const port = Number(process.env.PORT ?? 3000);

try {
  // 0.0.0.0, not localhost: inside a container, localhost is the
  // container — the outside world can only reach us on all-interfaces.
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

/** Graceful shutdown: stop accepting, drain in-flight, then exit. */
async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
