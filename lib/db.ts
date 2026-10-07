import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const PLACEHOLDER = "postgresql://unconfigured:unconfigured@127.0.0.1:5433/unconfigured";

/** Hosts a test may use: this machine only. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * The database this process may connect to, or null for none.
 *
 * Under test (NODE_ENV "test") only a database on this machine is accepted.
 * When DATABASE_URL is unset, importing @prisma/client fills it from .env,
 * and in this repo's .env the last DATABASE_URL is production: a test that
 * unset it (to exercise a no-database fallback) would otherwise have been
 * handed a production client.
 */
export function usableDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = env.DATABASE_URL;
  if (!url) return null;
  if (env.NODE_ENV === "test") {
    try {
      if (!LOCAL_HOSTS.has(new URL(url).hostname)) return null;
    } catch {
      return null;
    }
  }
  return url;
}

const url = usableDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        // A blank DATABASE_URL must fall back too, or Prisma throws "nonempty
        // URL" at construction and every page importing this module dies.
        url: url ?? PLACEHOLDER,
      },
    },
  });

// Reused across hot reloads, and across test files in one worker, only when
// it points at a real database. A placeholder, cached, was handed to every
// later importer, which is how one test that unsets the URL made the database
// tests after it skip.
if (process.env.NODE_ENV !== "production" && url) {
  globalForPrisma.prisma = prisma;
}
