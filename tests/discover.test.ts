import { describe, expect, it } from "vitest";
import {
  DISCOVER_TABS,
  matchesQuery,
  parseDiscoverTab,
  sortDiscoverEvents,
  sortDiscoverPeople,
} from "@/lib/community/discover";

describe("discover tabs", () => {
  it("accepts every tab it advertises", () => {
    for (const tab of DISCOVER_TABS) {
      expect(parseDiscoverTab(tab)).toBe(tab);
    }
  });

  it("falls back to all for anything else", () => {
    expect(parseDiscoverTab(undefined)).toBe("all");
    expect(parseDiscoverTab("")).toBe("all");
    expect(parseDiscoverTab("courses")).toBe("all");
    // A repeated ?tab= arrives as an array; the first one wins.
    expect(parseDiscoverTab(["people", "spaces"])).toBe("people");
    expect(parseDiscoverTab(["nonsense"])).toBe("all");
  });
});

describe("matchesQuery", () => {
  it("matches everything when the query is blank", () => {
    expect(matchesQuery(["Tacos"], "")).toBe(true);
    expect(matchesQuery([null, undefined], "   ")).toBe(true);
  });

  it("ignores case and surrounding space", () => {
    expect(matchesQuery(["The Best Plant-Based Tacos"], "  TACO ")).toBe(true);
  });

  it("searches every field it is given, not only the first", () => {
    expect(matchesQuery(["Tortas", "Mexican street food"], "street")).toBe(true);
  });

  it("tolerates missing fields rather than throwing", () => {
    expect(matchesQuery([null, undefined, "Falafel"], "falafel")).toBe(true);
    expect(matchesQuery([null, undefined], "falafel")).toBe(false);
  });

  it("does not match on a word that is absent", () => {
    expect(matchesQuery(["Vegan BBQ", "Sauces included"], "ramen")).toBe(false);
  });
});

describe("sortDiscoverEvents", () => {
  const event = (title: string, iso: string, past: boolean) => ({
    title,
    startsAt: new Date(iso),
    past,
  });

  it("puts upcoming before past, whatever order they arrive in", () => {
    const sorted = sortDiscoverEvents([
      event("old", "2026-01-02T00:00:00Z", true),
      event("soon", "2026-12-01T00:00:00Z", false),
    ]);
    expect(sorted.map((row) => row.title)).toEqual(["soon", "old"]);
  });

  it("orders upcoming soonest first", () => {
    const sorted = sortDiscoverEvents([
      event("later", "2026-12-20T00:00:00Z", false),
      event("sooner", "2026-12-01T00:00:00Z", false),
    ]);
    expect(sorted.map((row) => row.title)).toEqual(["sooner", "later"]);
  });

  it("orders past most-recent first, so the newest memory leads", () => {
    const sorted = sortDiscoverEvents([
      event("ancient", "2025-01-01T00:00:00Z", true),
      event("recent", "2026-09-01T00:00:00Z", true),
    ]);
    expect(sorted.map((row) => row.title)).toEqual(["recent", "ancient"]);
  });

  it("does not mutate the array it was handed", () => {
    const rows = [
      event("old", "2026-01-02T00:00:00Z", true),
      event("soon", "2026-12-01T00:00:00Z", false),
    ];
    sortDiscoverEvents(rows);
    expect(rows.map((row) => row.title)).toEqual(["old", "soon"]);
  });
});

describe("sortDiscoverPeople", () => {
  it("leads with the people the matcher had a reason for", () => {
    const sorted = sortDiscoverPeople([
      { handle: "ada", reason: null },
      { handle: "bo", reason: "You both cook Sichuan" },
    ]);
    expect(sorted.map((row) => row.handle)).toEqual(["bo", "ada"]);
  });

  it("keeps the incoming order among equals, so the rest stay alphabetical", () => {
    const sorted = sortDiscoverPeople([
      { handle: "ada", reason: null },
      { handle: "bo", reason: null },
      { handle: "cy", reason: null },
    ]);
    expect(sorted.map((row) => row.handle)).toEqual(["ada", "bo", "cy"]);
  });
});
