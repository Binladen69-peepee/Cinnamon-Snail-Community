import { describe, expect, it } from "vitest";
import {
  NAV_SECTION_SUGGESTIONS,
  filterSuggestions,
} from "@/lib/search/suggest";

describe("nav search suggestions", () => {
  it("offers live classes and standing sections with no query", () => {
    const rows = filterSuggestions(NAV_SECTION_SUGGESTIONS, "", 6);
    expect(rows[0]?.label).toBe("Live classes");
    expect(rows.some((row) => row.group === "Sections")).toBe(true);
  });

  it("filters to live classes when the query is live", () => {
    const rows = filterSuggestions(NAV_SECTION_SUGGESTIONS, "live");
    expect(rows.map((row) => row.label)).toContain("Live classes");
    expect(rows.every((row) => /live|class|calendar/i.test(`${row.label} ${row.group} ${row.snippet}`))).toBe(
      true,
    );
  });

  it("finds a section by partial name", () => {
    const rows = filterSuggestions(NAV_SECTION_SUGGESTIONS, "kitch");
    expect(rows).toEqual([
      expect.objectContaining({ label: "Kitchen Table", href: "/kitchen-table" }),
    ]);
  });

  it("never offers a section the client retired", () => {
    // DEC-078: no Explorer, no list of spaces, no drafts; events are Live
    // Classes and live at /live-classes.
    const hrefs = NAV_SECTION_SUGGESTIONS.map((row) => row.href);
    for (const retired of ["/home", "/spaces", "/drafts", "/calendar"]) {
      expect(hrefs).not.toContain(retired);
    }
    const labels = NAV_SECTION_SUGGESTIONS.map((row) => row.label.toLowerCase());
    expect(labels).not.toContain("explorer");
    expect(labels).not.toContain("spaces");
    expect(labels.some((label) => label.includes("event"))).toBe(false);
  });
});
