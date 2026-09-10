import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        // `||` not `??`: a blank DATABASE_URL (an env var set to an empty
        // string) must fall back too, or Prisma throws "nonempty URL" at
        // construction and every page importing this module dies.
        url:
          process.env.DATABASE_URL ||
          "postgresql://unconfigured:unconfigured@127.0.0.1:5433/unconfigured",
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
