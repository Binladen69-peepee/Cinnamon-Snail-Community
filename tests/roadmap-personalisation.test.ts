import { describe, expect, it } from "vitest";
import {
  FALLBACK_SENTENCE,
  PERSONAS,
  PERSONA_PHRASES,
  glutenFreeFromText,
  personaFromText,
  personalisationSentence,
  readSurveyAnswers,
  resolvePersonalisation,
  trackMatchesPersona,
  type Persona,
} from "@/lib/roadmap/personalisation";

/**
 * The one sentence at the top of the roadmap (DEC-080), in the client's own
 * template, for every combination of answers — and where those answers are
 * read from now that the page no longer asks for them.
 */

const CLOSING =
  "I’ve put together a customized learning roadmap based on what’s going to get you the best cooking wins, quickest!";

const none = {
  cookVibe: null,
  glutenFree: null,
  primaryBenefit: null,
  suckiestThing: null,
};

describe("the sentence, word for word", () => {
  it("follows the client's template for an advanced cook who is gluten-free", () => {
    expect(personalisationSentence({ persona: "advanced", glutenFree: true })).toBe(
      "Because you’ve told us you are on the more advanced side of vegan cooking, and are gluten-free, I’ve put together a customized learning roadmap based on what’s going to get you the best cooking wins, quickest!",
    );
  });

  it("says aren’t when they told us they are not", () => {
    expect(personalisationSentence({ persona: "new", glutenFree: false })).toBe(
      "Because you’ve told us you are new to vegan cooking, and aren’t gluten-free, I’ve put together a customized learning roadmap based on what’s going to get you the best cooking wins, quickest!",
    );
  });

  it("leaves the gluten-free clause out when that answer is unknown", () => {
    expect(personalisationSentence({ persona: "busy", glutenFree: null })).toBe(
      "Because you’ve told us you are a busy vegan professional, I’ve put together a customized learning roadmap based on what’s going to get you the best cooking wins, quickest!",
    );
  });

  it("names all four personas in the client's words", () => {
    expect(PERSONA_PHRASES).toEqual({
      advanced: "on the more advanced side of vegan cooking",
      new: "new to vegan cooking",
      family: "someone who shares vegan food with others",
      busy: "a busy vegan professional",
    });
  });

  it("covers every persona with every gluten-free answer", () => {
    const clauses: [boolean | null, string][] = [
      [true, ", and are gluten-free"],
      [false, ", and aren’t gluten-free"],
      [null, ""],
    ];
    expect(PERSONAS).toHaveLength(4);
    for (const persona of PERSONAS) {
      for (const [glutenFree, clause] of clauses) {
        expect(personalisationSentence({ persona, glutenFree })).toBe(
          `Because you’ve told us you are ${PERSONA_PHRASES[persona]}${clause}, ${CLOSING}`,
        );
      }
    }
  });

  it("speaks to gluten-free alone when that is all we know", () => {
    expect(personalisationSentence({ persona: null, glutenFree: true })).toBe(
      `Because you’ve told us you are gluten-free, ${CLOSING}`,
    );
  });

  it("falls back, without claiming to be tailored, when nothing worth a because is known", () => {
    // "Because you've told us you aren't gluten-free" would read as the
    // reason for the roadmap, which it is not.
    expect(personalisationSentence({ persona: null, glutenFree: false })).toBe(FALLBACK_SENTENCE);
    expect(personalisationSentence({ persona: null, glutenFree: null })).toBe(FALLBACK_SENTENCE);
    expect(FALLBACK_SENTENCE).not.toMatch(/because|customi[sz]ed/i);
    expect(FALLBACK_SENTENCE).toMatch(/best cooking wins, quickest!$/);
  });
});

describe("where the answers come from", () => {
  it("knows nothing, and falls back, for a member who never answered anything", () => {
    const resolved = resolvePersonalisation(none);
    expect(resolved).toMatchObject({
      persona: null,
      personaSource: null,
      glutenFree: null,
      glutenFreeSource: null,
      known: false,
      sentence: FALLBACK_SENTENCE,
    });
  });

  it("takes the member's own roadmap answers first", () => {
    const resolved = resolvePersonalisation({
      ...none,
      cookVibe: "family",
      glutenFree: true,
      surveyTraits: { rm_audience_segment: "Advanced", gluten_free: "No" },
      skill: "BEGINNER",
    });
    expect(resolved).toMatchObject({
      persona: "family",
      personaSource: "roadmap",
      glutenFree: true,
      glutenFreeSource: "roadmap",
      known: true,
    });
    expect(resolved.sentence).toContain("someone who shares vegan food with others, and are gluten-free");
  });

  it("reads the RightMessage survey answers from Kit when the member gave none in the app", () => {
    const resolved = resolvePersonalisation({
      ...none,
      surveyTraits: { rm_audience_segment: "Advanced", gluten_free: "Yes" },
    });
    expect(resolved).toMatchObject({
      persona: "advanced",
      personaSource: "survey",
      glutenFree: true,
      glutenFreeSource: "survey",
    });
  });

  it("falls back to the profile's cooking level, which can only say advanced or new", () => {
    expect(resolvePersonalisation({ ...none, skill: "ADVANCED" })).toMatchObject({
      persona: "advanced",
      personaSource: "profile",
    });
    expect(resolvePersonalisation({ ...none, skill: "BEGINNER" }).persona).toBe("new");
    expect(resolvePersonalisation({ ...none, skill: "CONFIDENT" }).persona).toBeNull();
  });

  it("lets a gluten-free yes from anywhere win over a no", () => {
    // Showing a gluten-free recipe to someone who does not need it costs
    // nothing; the reverse can make somebody ill.
    const fromProfile = resolvePersonalisation({ ...none, glutenFree: false, dietary: ["gluten-free"] });
    expect(fromProfile).toMatchObject({ glutenFree: true, glutenFreeSource: "profile" });
    const fromSurvey = resolvePersonalisation({ ...none, glutenFree: false, surveyTraits: { gluten_free: "yes" } });
    expect(fromSurvey).toMatchObject({ glutenFree: true, glutenFreeSource: "survey" });
    const onlyNo = resolvePersonalisation({ ...none, glutenFree: false, dietary: ["nut-free"] });
    expect(onlyNo).toMatchObject({ glutenFree: false, glutenFreeSource: "roadmap" });
  });

  it("ignores an in-app answer outside the vocabulary rather than trusting it", () => {
    expect(resolvePersonalisation({ ...none, cookVibe: "whatever" }).persona).toBeNull();
  });

  it("fills framing and constraint keys from the survey when the app has none", () => {
    const resolved = resolvePersonalisation({
      ...none,
      surveyTraits: { q_primary_benefit: "Feeling better day to day", q_suckiest_thing: "time" },
    });
    expect(resolved).toMatchObject({ primaryBenefit: "health", suckiestThing: "time", known: true });
    // Known, but nothing for the sentence: it falls back honestly.
    expect(resolved.sentence).toBe(FALLBACK_SENTENCE);
  });
});

describe("reading the survey fields", () => {
  it("finds the fields however Kit named them, flat or under fields", () => {
    expect(readSurveyAnswers({ ck_field_1168205_gluten_free: "true" }).glutenFree).toBe(true);
    expect(readSurveyAnswers({ "Gluten Free": "No" }).glutenFree).toBe(false);
    expect(readSurveyAnswers({ fields: { audience_segment: "busy" } }).persona).toBe("busy");
    // The more specific RightMessage field wins over the derived one.
    expect(
      readSurveyAnswers({ rm_audience_segment: "New to vegan cooking", audience_segment: "advanced" }).persona,
    ).toBe("new");
  });

  it("never reads Kit's default \"family\" segment as something the member told us", () => {
    // audience_segment says "family" for everyone who never answered.
    expect(readSurveyAnswers({ audience_segment: "family" }).persona).toBeNull();
    expect(readSurveyAnswers({ fields: { audience_segment: "Family" } }).persona).toBeNull();
    // The RightMessage field itself is an answer, "family" included.
    expect(
      readSurveyAnswers({ rm_audience_segment: "family", audience_segment: "family" }).persona,
    ).toBe("family");
    // And audience_segment's other values still count.
    expect(readSurveyAnswers({ audience_segment: "advanced" }).persona).toBe("advanced");
  });

  it("agrees with the crews: the traits the crews sync stored come first", () => {
    // The shape `lib/crews/survey-traits.ts` writes to Profile.surveyTraits.
    const stored = (traits: string[], fields: Record<string, string> = {}) => ({
      v: 1,
      found: true,
      traits,
      fields,
      mapping: "abc",
    });
    expect(readSurveyAnswers(stored(["advanced", "gf"]))).toMatchObject({
      persona: "advanced",
      glutenFree: true,
    });
    expect(readSurveyAnswers(stored(["new"])).persona).toBe("new");
    // The trait wins over a field that says otherwise, as the crews do.
    expect(readSurveyAnswers(stored(["new"], { audience_segment: "advanced" })).persona).toBe("new");
    // Two levels at once: only the segment field itself can say which.
    expect(readSurveyAnswers(stored(["new", "advanced"])).persona).toBeNull();
    expect(
      readSurveyAnswers(stored(["new", "advanced"], { rm_audience_segment: "Advanced" })).persona,
    ).toBe("advanced");
    // No gf trait is not a "no": the sync keeps only the fields that made a trait.
    expect(readSurveyAnswers(stored([])).glutenFree).toBeNull();
    // Found in Kit with nothing that made a trait: nothing known.
    expect(resolvePersonalisation({ ...none, surveyTraits: stored([]) }).known).toBe(false);
  });

  it("does not mistake unrelated Kit fields for answers", () => {
    expect(readSurveyAnswers({ thx_track: "advanced", rm_reading_cuisine: "busy" })).toEqual({
      persona: null,
      glutenFree: null,
      primaryBenefit: null,
      suckiestThing: null,
    });
  });

  it("reads nothing from something that is not an object", () => {
    for (const raw of [null, undefined, "advanced", 7, ["advanced"]]) {
      expect(readSurveyAnswers(raw).persona).toBeNull();
    }
  });

  it("maps a segment name onto the four personas, or onto nothing", () => {
    const cases: [string, Persona | null][] = [
      ["advanced", "advanced"],
      ["Ready to go deeper", "advanced"],
      ["Advanced Cook", "advanced"],
      ["Busy Professional", "busy"],
      ["Short on time", "busy"],
      ["Cooking for others", "family"],
      ["Feeding my family", "family"],
      ["New to this", "new"],
      ["Beginner", "new"],
      ["Renewal", null],
      ["Vegan curious", null],
      ["", null],
    ];
    for (const [text, persona] of cases) expect(personaFromText(text), text).toBe(persona);
    expect(personaFromText(42)).toBeNull();
  });

  it("reads gluten-free as yes, no or unknown", () => {
    const cases: [unknown, boolean | null][] = [
      [true, true],
      [false, false],
      [1, true],
      [0, false],
      ["Yes", true],
      ["yes, always", true],
      ["GF", true],
      ["I eat gluten-free", true],
      ["Celiac", true],
      ["No", false],
      ["no thanks", false],
      ["Not gluten free", false],
      ["I don't need gluten-free", false],
      ["no gluten restriction", false],
      ["maybe", null],
      ["", null],
      [null, null],
    ];
    for (const [value, expected] of cases) expect(glutenFreeFromText(value), String(value)).toBe(expected);
  });
});

describe("which track the answers point to", () => {
  const track = (slug: string, name: string) => ({ slug, name });

  it("matches the persona in the slug or as a word of the name", () => {
    expect(trackMatchesPersona(track("busy", "Weeknights"), "busy")).toBe(true);
    expect(trackMatchesPersona(track("busy-weeknights", "Weeknights"), "busy")).toBe(true);
    expect(trackMatchesPersona(track("track-2", "The Family Table"), "family")).toBe(true);
  });

  it("does not match a persona hiding inside another word", () => {
    expect(trackMatchesPersona(track("renewal", "Renewal"), "new")).toBe(false);
    expect(trackMatchesPersona(track("newsletter-picks", "Newsletter picks"), "new")).toBe(false);
  });

  it("matches nothing without a persona, except a stored answer that is the slug", () => {
    expect(trackMatchesPersona(track("busy", "Busy"), null)).toBe(false);
    expect(trackMatchesPersona(track("busy-abc", "Busy abc"), null, "busy-abc")).toBe(true);
  });
});
