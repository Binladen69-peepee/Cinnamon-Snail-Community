import { describe, expect, it } from "vitest";
import {
  MEMBER_SORTS,
  parseMemberSort,
  parsePage,
  pickSuggested,
  sortDirectory,
} from "@/lib/community/directory";

const member = (
  displayName: string,
  extra: Partial<{ reason: string | null; sharedSpaces: number; joinedAt: Date }> = {},
) => ({
  displayName,
  reason: extra.reason ?? null,
  sharedSpaces: extra.sharedSpaces ?? 0,
  joinedAt: extra.joinedAt ?? new Date("2026-01-01T00:00:00Z"),
});

describe("parseMemberSort", () => {
  it("accepts every sort it advertises", () => {
    for (const sort of MEMBER_SORTS) {
      expect(parseMemberSort(sort)).toBe(sort);
    }
  });

  it("falls back to suggested for anything else", () => {
    expect(parseMemberSort(undefined)).toBe("suggested");
    expect(parseMemberSort("")).toBe("suggested");
    // "active" is the leaderboard sort BUILD.md rules out; it must not slip in
    // through the URL.
    expect(parseMemberSort("active")).toBe("suggested");
    expect(parseMemberSort(["name", "newest"])).toBe("name");
  });
});

describe("parsePage", () => {
  it("defaults to the first page", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("1")).toBe(1);
  });

  it("reads a real page number", () => {
    expect(parsePage("4")).toBe(4);
    expect(parsePage(["3"])).toBe(3);
  });

  it("refuses nonsense and negatives rather than throwing", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("2.9")).toBe(2);
  });
});

describe("sortDirectory", () => {
  it("sorts A-Z by display name", () => {
    const sorted = sortDirectory(
      [member("Priya"), member("Adam"), member("Jordan")],
      "name",
    );
    expect(sorted.map((m) => m.displayName)).toEqual(["Adam", "Jordan", "Priya"]);
  });

  it("sorts newest by join date, most recent first", () => {
    const sorted = sortDirectory(
      [
        member("Old", { joinedAt: new Date("2025-01-01T00:00:00Z") }),
        member("New", { joinedAt: new Date("2026-06-01T00:00:00Z") }),
      ],
      "newest",
    );
    expect(sorted.map((m) => m.displayName)).toEqual(["New", "Old"]);
  });

  it("breaks a join-date tie by name, so the order is never arbitrary", () => {
    const same = new Date("2026-02-02T00:00:00Z");
    const sorted = sortDirectory(
      [member("Zoe", { joinedAt: same }), member("Ana", { joinedAt: same })],
      "newest",
    );
    expect(sorted.map((m) => m.displayName)).toEqual(["Ana", "Zoe"]);
  });

  it("leads suggested with the people the matcher had a reason for", () => {
    const sorted = sortDirectory(
      [member("Ana"), member("Zoe", { reason: "You both cook Sichuan" })],
      "suggested",
    );
    expect(sorted.map((m) => m.displayName)).toEqual(["Zoe", "Ana"]);
  });

  it("then prefers whoever shares more rooms with the viewer", () => {
    const sorted = sortDirectory(
      [
        member("Ana", { sharedSpaces: 1 }),
        member("Zoe", { sharedSpaces: 4 }),
        member("Bo", { sharedSpaces: 0 }),
      ],
      "suggested",
    );
    expect(sorted.map((m) => m.displayName)).toEqual(["Zoe", "Ana", "Bo"]);
  });

  it("falls back to name so equal members do not shuffle between loads", () => {
    const sorted = sortDirectory(
      [member("Zoe"), member("Ana"), member("Bo")],
      "suggested",
    );
    expect(sorted.map((m) => m.displayName)).toEqual(["Ana", "Bo", "Zoe"]);
  });

  it("does not mutate the array it was handed", () => {
    const rows = [member("Zoe"), member("Ana")];
    sortDirectory(rows, "name");
    expect(rows.map((m) => m.displayName)).toEqual(["Zoe", "Ana"]);
  });
});

describe("pickSuggested", () => {
  const person = (displayName: string, reason: string | null) => ({
    displayName,
    reason,
  });

  it("returns the shortlist when it is genuinely shorter than the directory", () => {
    const picked = pickSuggested(
      [
        person("Ana", "You both cook Sichuan"),
        person("Bo", null),
        person("Cy", null),
      ],
      false,
    );
    expect(picked.map((p) => p.displayName)).toEqual(["Ana"]);
  });

  it("returns nothing when the matcher found a reason for everybody", () => {
    // A strip holding the whole directory, above a grid holding the same
    // people, is the same list twice.
    const picked = pickSuggested(
      [person("Ana", "shared rooms"), person("Bo", "shared rooms")],
      false,
    );
    expect(picked).toEqual([]);
  });

  it("returns nothing while filtering or past page one", () => {
    const everyone = [
      person("Ana", "You both cook Sichuan"),
      person("Bo", null),
      person("Cy", null),
    ];
    expect(pickSuggested(everyone, true)).toEqual([]);
  });

  it("caps the shortlist at five", () => {
    const everyone = Array.from({ length: 12 }, (_, i) =>
      person(`M${String(i).padStart(2, "0")}`, i < 8 ? "reason" : null),
    );
    expect(pickSuggested(everyone, false)).toHaveLength(5);
  });
});
