import { describe, expect, it } from "vitest";
import {
  NAV_SECTION_SUGGESTIONS,
  filterSuggestions,
} from "@/lib/search/suggest";

describe("nav search suggestions", () => {
  it("offers live classes and standing sections with no query", () => {
    const rows = filterSuggestions(NAV_SECTION_SUGGESTIONS, "", 6);
    expect(rows[0]?.label).toBe("Live cook-alongs");
    expect(rows.some((row) => row.group === "Sections")).toBe(true);
  });

  it("filters to cook-alongs and classes when the query is live", () => {
    const rows = filterSuggestions(NAV_SECTION_SUGGESTIONS, "live");
    expect(rows.map((row) => row.label)).toContain("Live cook-alongs");
    expect(rows.every((row) => /live|class|calendar/i.test(`${row.label} ${row.group} ${row.snippet}`))).toBe(
      true,
    );
  });

  it("finds a section by partial name", () => {
    const rows = filterSuggestions(NAV_SECTION_SUGGESTIONS, "kitchen");
    expect(rows).toEqual([
      expect.objectContaining({ label: "Kitchen Table", href: "/home" }),
    ]);
  });
});
