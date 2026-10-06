import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nothing in the app links to an address that only redirects now.
 *
 * Explorer (`/home`) became the Kitchen Table (DEC-078) and the calendar
 * (`/calendar`) became Live Classes (DEC-079). The old addresses redirect, so
 * a stale link still works, but it costs a member a round trip and keeps the
 * retired name alive in notifications, previews and calendar files. Every
 * page, action, job and library is read; comments are not code, and
 * `robots.ts` names the old addresses on purpose (they still exist, as
 * redirects, and should not be crawled).
 */

const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const rel = (file: string) => file.replace(root, "").replace(/\\/g, "/").slice(1);

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const NOT_LINKS = new Set(["app/robots.ts"]);

const FILES = ["app", "lib", "components"]
  .flatMap((dir) => walk(resolve(root, dir)))
  .filter((file) => !NOT_LINKS.has(rel(file)));

const RETIRED = [
  { name: "/home", pattern: /["'`]\/home(?:["'`?#/]|$)/m },
  { name: "/calendar", pattern: /["'`]\/calendar(?:["'`?#/]|\$\{|$)/m },
];

describe("retired addresses", () => {
  it("are linked from nowhere in the app", () => {
    expect(FILES.length).toBeGreaterThan(100);
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = withoutComments(readFileSync(file, "utf8"));
      for (const { name, pattern } of RETIRED) {
        if (pattern.test(source)) offenders.push(`${rel(file)} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("are caught by this check when they appear", () => {
    // The check itself, on the shapes these links were written in.
    const samples = [
      'redirect("/home")',
      'href: "/home?view=reels"',
      "href={`/calendar/${event.slug}`}",
      'revalidatePath("/calendar")',
    ];
    for (const sample of samples) {
      expect(RETIRED.some(({ pattern }) => pattern.test(sample)), sample).toBe(true);
    }
    for (const fine of ['"/kitchen-table"', "`/live-classes/${slug}`", '"/homework"', "text/calendar"]) {
      expect(RETIRED.some(({ pattern }) => pattern.test(fine)), fine).toBe(false);
    }
  });
});
