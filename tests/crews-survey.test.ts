import { describe, expect, it } from "vitest";
import {
  parseSurveyMapping,
  readStoredSurveyTraits,
  storedSurveyTraits,
  traitsFromFields,
} from "@/lib/crews/survey-traits";

/**
 * RightMessage answers in Kit custom fields → crew traits (DEC-078). The
 * default reads the client's real fields (seen in their Kit account on
 * 2026-10-06): gluten_free "true"/"false", and rm_audience_segment (with
 * audience_segment as a fallback) "advanced" / "new" / "busy" / "family".
 * KIT_SURVEY_FIELDS can still name other fields.
 */
const defaults = parseSurveyMapping(undefined);

describe("the default mapping", () => {
  it("is in force with nothing set, or with the bare trait list", () => {
    expect(defaults.configured).toBe(false);
    expect(parseSurveyMapping("gf,advanced,new").configured).toBe(false);
    expect(parseSurveyMapping("gf,advanced,new").key).toBe(defaults.key);
  });

  it("reads gluten_free as a yes/no answer", () => {
    expect(traitsFromFields({ gluten_free: "true" }, defaults).traits).toEqual(["gf"]);
    expect(traitsFromFields({ gluten_free: "Yes" }, defaults).traits).toEqual(["gf"]);
    expect(traitsFromFields({ gluten_free: "false" }, defaults).traits).toEqual([]);
    expect(traitsFromFields({ gluten_free: "" }, defaults).traits).toEqual([]);
  });

  it("reads the RightMessage segment for Advanced and New, case-insensitively", () => {
    expect(traitsFromFields({ rm_audience_segment: "advanced" }, defaults).traits).toEqual(["advanced"]);
    expect(traitsFromFields({ rm_audience_segment: "New" }, defaults).traits).toEqual(["new"]);
    expect(traitsFromFields({ rm_audience_segment: "busy" }, defaults).traits).toEqual([]);
    expect(traitsFromFields({ rm_audience_segment: "Family Cook" }, defaults).traits).toEqual([]);
  });

  it("falls back to audience_segment when the RightMessage field is empty", () => {
    expect(traitsFromFields({ audience_segment: "advanced" }, defaults).traits).toEqual(["advanced"]);
    // "family" is what audience_segment says for people who never answered.
    expect(traitsFromFields({ audience_segment: "family" }, defaults).traits).toEqual([]);
  });

  it("combines the gluten-free answer with the segment", () => {
    const match = traitsFromFields({ gluten_free: "true", rm_audience_segment: "new" }, defaults);
    expect(match.traits).toEqual(["gf", "new"]);
  });

  it("never reads unrelated fields, however their values read", () => {
    const match = traitsFromFields(
      { utm_campaign: "new", utm_content: "advanced", diet: "GF", last_name: "New", note: "newsletter" },
      defaults,
    );
    expect(match.traits).toEqual([]);
  });

  it("keeps the trait fields and the survey context the roadmap reads, and nothing else", () => {
    const match = traitsFromFields(
      {
        rm_audience_segment: "busy",
        gluten_free: "false",
        q_primary_benefit: "healthy_nourishing",
        q_suckiest_thing: "time_consuming_recipes",
        phone: "555-0100",
        utm_source: "instagram",
      },
      defaults,
    );
    expect(match.traits).toEqual([]);
    expect(match.fields).toEqual({
      rm_audience_segment: "busy",
      gluten_free: "false",
      q_primary_benefit: "healthy_nourishing",
      q_suckiest_thing: "time_consuming_recipes",
    });
  });
});

describe("a configured mapping", () => {
  const mapping = parseSurveyMapping(
    "gf=Dietary Needs:gluten free|celiac, advanced=cooking_level:advanced|pro, new=cooking_level:beginner",
  );

  it("names fields by key or label and reads only those values", () => {
    expect(mapping.configured).toBe(true);
    expect(traitsFromFields({ dietary_needs: "Celiac" }, mapping).traits).toEqual(["gf"]);
    expect(traitsFromFields({ cooking_level: "Pro" }, mapping).traits).toEqual(["advanced"]);
    expect(traitsFromFields({ cooking_level: "Beginner" }, mapping).traits).toEqual(["new"]);
    expect(traitsFromFields({ dietary_needs: "vegan" }, mapping).traits).toEqual([]);
  });

  it("stops the configured traits matching by default", () => {
    // gf is configured to read dietary_needs only, so a stray "GF" elsewhere
    // is no longer enough.
    expect(traitsFromFields({ diet: "GF" }, mapping).traits).toEqual([]);
  });

  it("treats a field with no values listed as a yes/no question", () => {
    const yesNo = parseSurveyMapping("gf=is_gluten_free");
    expect(traitsFromFields({ is_gluten_free: "Yes" }, yesNo).traits).toEqual(["gf"]);
    expect(traitsFromFields({ is_gluten_free: "no" }, yesNo).traits).toEqual([]);
    // Traits it does not mention keep the default.
    expect(traitsFromFields({ rm_audience_segment: "New" }, yesNo).traits).toEqual(["new"]);
  });

  it("reports entries it cannot read instead of guessing", () => {
    const broken = parseSurveyMapping("vegan=diet:vegan, gf=");
    expect(broken.problems).toHaveLength(2);
    expect(broken.rules.every((rule) => rule.kind === "default")).toBe(true);
  });

  it("changes its fingerprint when the mapping changes", () => {
    expect(mapping.key).not.toBe(defaults.key);
    expect(parseSurveyMapping("gf=a:b").key).not.toBe(parseSurveyMapping("gf=a:c").key);
  });
});

describe("what is stored on the profile", () => {
  it("round-trips, and tolerates anything else in the column", () => {
    const stored = storedSurveyTraits({
      found: true,
      match: traitsFromFields({ diet: "GF" }, defaults),
      mapping: defaults,
    });
    expect(readStoredSurveyTraits(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(readStoredSurveyTraits(null)).toBeNull();
    expect(readStoredSurveyTraits({ gf: true })).toBeNull();
    expect(readStoredSurveyTraits({ v: 1, traits: ["gf", "nonsense"] })?.traits).toEqual(["gf"]);
  });
});
