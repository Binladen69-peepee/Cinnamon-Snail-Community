import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The roadmap focus card on the Kitchen Table (C5, DEC-080).
 *
 * `AppShell`'s right rail only shows from `xl`, so a card that lives only in
 * the rail never reaches a phone or a tablet. Below `xl` the same card leads
 * the feed column; from `xl` it stays in the rail, and the column's copy is
 * hidden, so a wide screen never shows it twice. Read from the source,
 * because the rule is about where the card is placed and which breakpoint
 * hides which.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const page = read("app/(member)/kitchen-table/page.tsx");
const shell = read("components/app/app-shell.tsx");

describe("the roadmap focus card", () => {
  it("stays first in the rail, which only shows from xl", () => {
    expect(page).toMatch(/<FeedRail\s+focus=\{[\s\S]*?<RoadmapFocusCard userId=\{userId\} \/>/);
    expect(shell).toMatch(/<aside className="[^"]*\bhidden\b[^"]*\bxl:block\b/);
  });

  it("leads the feed column below xl, and is hidden there from xl", () => {
    const column = page.slice(page.indexOf("<PageHeader"));
    const focus = column.indexOf("<MobileFocus userId={userId} />");
    expect(focus).toBeGreaterThan(-1);
    // After the page's title, before the composer and the feed.
    expect(focus).toBeLessThan(column.indexOf("<Composer"));
    expect(focus).toBeLessThan(column.indexOf("<FeedStream"));

    const mobile = page.slice(page.indexOf("function MobileFocus"));
    expect(mobile).toContain('<div className="contents xl:hidden">');
    expect(mobile).toMatch(/<Suspense fallback=\{null\}>\s*<RoadmapFocusCard userId=\{userId\} \/>/);
  });

  it("is placed exactly twice: the rail, and the column below xl", () => {
    expect(page.match(/<RoadmapFocusCard userId=\{userId\} \/>/g)).toHaveLength(2);
  });
});
