import { afterEach, describe, expect, it, vi } from "vitest";
import { usableDatabaseUrl } from "@/lib/db";

/**
 * The shared Prisma client (lib/db).
 *
 * Two things it guarantees:
 * - Under test it only ever connects to a database on this machine. When
 *   DATABASE_URL is unset, importing @prisma/client fills it from .env, and
 *   this repo's .env lists production last, so a test that unset it was one
 *   import away from a production client.
 * - It is cached on globalThis (so hot reloads do not open a pool each time)
 *   only when it points at a real database. A placeholder used to be cached
 *   too, and every module importing lib/db afterwards in the same worker got
 *   the dead client: the database tests behind it skipped as if Postgres were
 *   down.
 */

const holder = globalThis as unknown as { prisma?: unknown };

describe("which database a process may use", () => {
  it("takes a database on this machine under test", () => {
    for (const host of ["127.0.0.1", "localhost"]) {
      const url = `postgresql://user:pass@${host}:5433/db`;
      expect(usableDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: url })).toBe(url);
    }
  });

  it("never gives a test a database off this machine", () => {
    for (const url of [
      "postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
      "postgresql://postgres.ref:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
      "not a url",
    ]) {
      expect(usableDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: url }), url).toBeNull();
    }
  });

  it("leaves development and production their configured database", () => {
    const url = "postgresql://postgres:secret@db.example.supabase.co:5432/postgres";
    expect(usableDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: url })).toBe(url);
    expect(usableDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: url })).toBe(url);
    expect(usableDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "" })).toBeNull();
  });
});

describe("the shared database client", () => {
  const savedUrl = process.env.DATABASE_URL;
  const savedClient = holder.prisma;

  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    holder.prisma = savedClient;
    vi.resetModules();
  });

  it("does not cache a client built without a usable DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    delete holder.prisma;
    vi.resetModules();
    const { prisma } = await import("@/lib/db");
    // Booleans, not the client itself: formatting a Prisma client for an
    // assertion message recurses without end.
    expect(prisma !== undefined).toBe(true);
    expect(holder.prisma === undefined).toBe(true);
  });

  it("caches a client that points at a database on this machine", async () => {
    process.env.DATABASE_URL = "postgresql://someone:secret@127.0.0.1:5433/somewhere";
    delete holder.prisma;
    vi.resetModules();
    const { prisma } = await import("@/lib/db");
    expect(holder.prisma === prisma).toBe(true);
  });
});
