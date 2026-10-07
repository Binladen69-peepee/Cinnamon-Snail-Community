import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Row-level security on every table (DEC-083).
 *
 * Supabase serves the public schema through its Data API to anyone holding
 * the project's anon key, and grants its API roles every privilege on each
 * table a migration creates. A table without RLS is therefore readable and
 * writable from the internet. All 96 tables were, until 2026-10-07.
 *
 * The app reaches its tables only through Prisma as their owner, which RLS
 * does not restrict, so every table gets RLS and no policies. These tests
 * keep it that way: a migration that creates a table without enabling RLS on
 * it fails here, before it can reach production.
 */

const MIGRATIONS = resolve(process.cwd(), "prisma/migrations");

const migrations = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8") }));

const names = (sql: string, pattern: RegExp) => [...sql.matchAll(pattern)].map((match) => match[1]!);

const CREATE = /CREATE TABLE (?:IF NOT EXISTS )?(?:"public"\.)?"([A-Za-z0-9_]+)"/g;
const DROP = /DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"([A-Za-z0-9_]+)"/g;
const ENABLE = /ALTER TABLE (?:"public"\.)?"([A-Za-z0-9_]+)" ENABLE ROW LEVEL SECURITY/g;

describe("row-level security (DEC-083)", () => {
  it("enables RLS on every table any migration creates", () => {
    const live = new Set<string>(["_prisma_migrations"]);
    const secured = new Set<string>();
    for (const { sql } of migrations) {
      for (const table of names(sql, CREATE)) live.add(table);
      for (const table of names(sql, DROP)) live.delete(table);
      for (const table of names(sql, ENABLE)) secured.add(table);
    }
    const missing = [...live].filter((table) => !secured.has(table)).sort();
    expect(
      missing,
      `Tables without ENABLE ROW LEVEL SECURITY. Add "ALTER TABLE "public"."<Table>" ENABLE ROW LEVEL SECURITY;" to the migration that creates each one.`,
    ).toEqual([]);
    expect(live.size).toBeGreaterThanOrEqual(96);
  });

  it("adds no policies: nothing in public is meant to be read through the Data API", () => {
    for (const { name, sql } of migrations) {
      expect(sql, name).not.toMatch(/CREATE POLICY/i);
      expect(sql, name).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
    }
  });

  it("takes the API roles' privileges away, now and for future tables, only where they exist", () => {
    const rls = migrations.find(({ name }) => name.endsWith("_enable_rls_public"));
    expect(rls).toBeDefined();
    const sql = rls!.sql;
    for (const role of ["anon", "authenticated"]) {
      expect(sql).toContain(`IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')`);
      expect(sql).toContain(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role};`);
      expect(sql).toContain(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role};`);
      expect(sql).toContain(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role};`);
    }
    // service_role is the server's own secret key; it keeps its access.
    expect(sql).not.toMatch(/FROM service_role/);
  });
});

describe("row-level security in the migrated database", () => {
  const prisma = new PrismaClient();
  let reachable = true;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      reachable = false;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

  it("has no table in public without RLS", async () => {
    if (!reachable) return;
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
      ORDER BY 1`;
    expect(rows.map((row) => row.name)).toEqual([]);
  });

  it("grants the API roles nothing on public tables, where those roles exist", async () => {
    if (!reachable) return;
    const rows = await prisma.$queryRaw<{ grantee: string; table_name: string }[]>`
      SELECT grantee, table_name FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')`;
    expect(rows).toEqual([]);
  });

  it("still lets the app read through Prisma", async () => {
    if (!reachable) return;
    await expect(prisma.user.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
