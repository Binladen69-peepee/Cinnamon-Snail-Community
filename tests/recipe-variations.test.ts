import { describe, expect, it } from "vitest";
import { checkVegan, parseIngredients } from "@/lib/recipes/vegan-check";

describe("vegan validation", () => {
  it("passes an ordinary substitution", () => {
    const verdict = checkVegan({
      note: "I swapped the cashews for sunflower seeds and roasted them first.",
      ingredients: ["100g sunflower seeds", "1 tbsp olive oil"],
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.flags).toEqual([]);
  });

  it("blocks ingredients with no vegan version", () => {
    for (const term of ["parmesan", "fish sauce", "gelatin", "honey", "lard", "anchovies"]) {
      const verdict = checkVegan({ note: `I added a little ${term} at the end.` });
      expect(verdict.ok, term).toBe(false);
      expect(verdict.flags.some((flag) => flag.blocking), term).toBe(true);
    }
  });

  it("tells the member which ingredient to change", () => {
    const verdict = checkVegan({ note: "Finish with parmesan." });
    expect(verdict.flags[0]!.note).toContain("parmesan");
    expect(verdict.flags[0]!.note).toContain("substitute");
  });

  it("only queries words that have a vegan version, never blocks them", () => {
    const verdict = checkVegan({ note: "I used butter instead of oil." });
    expect(verdict.ok).toBe(true);
    expect(verdict.flags).toHaveLength(1);
    expect(verdict.flags[0]!.blocking).toBe(false);
    expect(verdict.flags[0]!.note).toContain("vegan butter");
  });

  it("says nothing when the member already wrote vegan", () => {
    for (const note of [
      "I used vegan butter instead of oil.",
      "Swapped in plant-based milk.",
      "Dairy-free cheese works here.",
    ]) {
      expect(checkVegan({ note }).flags, note).toEqual([]);
    }
  });

  it("does not fire on words that merely contain an ingredient", () => {
    // "eggplant" contains "egg"; "hamper" contains "ham".
    const verdict = checkVegan({ note: "Roast the eggplant until it collapses." });
    expect(verdict.flags).toEqual([]);
  });

  it("checks the ingredient list, not just the note", () => {
    const verdict = checkVegan({ note: "Barely changed it.", ingredients: ["2 tbsp honey"] });
    expect(verdict.ok).toBe(false);
  });

  it("reports every problem at once", () => {
    const verdict = checkVegan({ note: "Parmesan and a spoon of honey." });
    expect(verdict.flags.filter((flag) => flag.blocking).length).toBeGreaterThanOrEqual(2);
  });
});

describe("parseIngredients", () => {
  it("reads a newline list or an array, and caps it", () => {
    expect(parseIngredients("one\n two \n\nthree")).toEqual(["one", "two", "three"]);
    expect(parseIngredients(["a", "", "  b  "])).toEqual(["a", "b"]);
    expect(parseIngredients(null)).toEqual([]);
    expect(parseIngredients(42)).toEqual([]);
    expect(parseIngredients(Array.from({ length: 100 }, (_, i) => `x${i}`))).toHaveLength(60);
  });
});
