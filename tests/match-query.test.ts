import { describe, expect, it } from "vitest";
import { matchesQuery } from "@/lib/community/match";

/**
 * The one matcher the class library and the message picker share. These moved
 * with it out of the Discover tests when that page was removed.
 */
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
