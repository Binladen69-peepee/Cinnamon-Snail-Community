import {
  COOK_VIBES,
  PRIMARY_BENEFITS,
  SUCKIEST_THINGS,
  normalizeAnswer,
  type Answer,
} from "@/lib/roadmap/answers";

/**
 * The one sentence at the top of the roadmap — DEC-080.
 *
 * Members answered the onboarding questions before they ever reach the
 * roadmap, so the page no longer asks them again. It tells them, in one
 * sentence, what it heard:
 *
 * > Because you’ve told us you are {persona}, and {are | aren’t}
 * > gluten-free, I’ve put together a customized learning roadmap based on
 * > what’s going to get you the best cooking wins, quickest!
 *
 * The four personas are the four §14 cook vibes (the four tracks), so a
 * persona is a cook-vibe value. Where each answer is read from, in order:
 *
 * | answer | 1. own roadmap answer | 2. RightMessage survey (Kit) | 3. profile |
 * |---|---|---|---|
 * | persona | `Profile.cookVibe` | crew trait advanced / new, else `rm_audience_segment` / `audience_segment` (not its default "family") | `Profile.skill` (Advanced / Beginner only) |
 * | gluten-free | `Profile.glutenFree` | crew trait gf, else `gluten_free` | "Gluten free" dietary need |
 * | primary benefit | `Profile.primaryBenefit` | `q_primary_benefit` | — |
 * | suckiest thing | `Profile.suckiestThing` | `q_suckiest_thing` | — |
 *
 * The survey answers are the Kit custom fields RightMessage writes, as the
 * crews sync stores them on `Profile.surveyTraits`; the traits that sync
 * settled on come first, so the sentence agrees with the member's crews.
 * Gluten-free is the one answer that is not first-come: a "yes" from any
 * source wins, because showing a gluten-free recipe to someone who does not
 * need it costs nothing, and the reverse can make somebody ill.
 *
 * Pure and database-free, so every combination is tested.
 */

export type Persona = "advanced" | "new" | "family" | "busy";

/** How the sentence names each persona: the client's wording, verbatim. */
export const PERSONA_PHRASES: Record<Persona, string> = {
  advanced: "on the more advanced side of vegan cooking",
  new: "new to vegan cooking",
  family: "someone who shares vegan food with others",
  busy: "a busy vegan professional",
};

export const PERSONAS = Object.keys(PERSONA_PHRASES) as Persona[];

export function isPersona(value: unknown): value is Persona {
  return typeof value === "string" && value in PERSONA_PHRASES;
}

const CLOSING =
  "I’ve put together a customized learning roadmap based on what’s going to get you the best cooking wins, quickest!";

/**
 * When nothing (or nothing worth a "because") is known. It makes no claim to
 * have been tailored, because it was not.
 */
export const FALLBACK_SENTENCE =
  "I’ve put together a learning roadmap based on what’s going to get you the best cooking wins, quickest!";

/**
 * The sentence for these answers. Pure.
 *
 * - persona known: the template, with the gluten-free clause when that answer
 *   is known and without it when it is not;
 * - only "is gluten-free" known: the template around that alone;
 * - only "isn’t gluten-free", or nothing: the fallback. "Because you’ve told
 *   us you aren’t gluten-free" would read as the reason for the roadmap,
 *   which it is not.
 */
export function personalisationSentence(answers: {
  persona: Persona | null;
  glutenFree: boolean | null;
}): string {
  const { persona, glutenFree } = answers;
  if (persona) {
    const clause =
      glutenFree === true
        ? ", and are gluten-free"
        : glutenFree === false
          ? ", and aren’t gluten-free"
          : "";
    return `Because you’ve told us you are ${PERSONA_PHRASES[persona]}${clause}, ${CLOSING}`;
  }
  if (glutenFree === true) {
    return `Because you’ve told us you are gluten-free, ${CLOSING}`;
  }
  return FALLBACK_SENTENCE;
}

// ---------------------------------------------------------------------------
// Reading the RightMessage answers Kit holds

/** Kit custom field keys that carry each answer, most specific first. */
export const SURVEY_FIELDS = {
  persona: ["rm_audience_segment", "audience_segment", "cook_vibe"],
  glutenFree: ["gluten_free", "rm_gluten_free"],
  primaryBenefit: ["q_primary_benefit", "primary_benefit"],
  suckiestThing: ["q_suckiest_thing", "suckiest_thing"],
} as const;

export type SurveyAnswers = {
  persona: Persona | null;
  glutenFree: boolean | null;
  primaryBenefit: string | null;
  suckiestThing: string | null;
};

/**
 * Kit names a field three ways (`gluten_free`, `Gluten Free`,
 * `ck_field_1168205_gluten_free`); all three reach the same key.
 */
function fieldKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/^ck_field_\d+_/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Scalar values by normalised key: the object itself, then a `fields` map inside it. */
function surveyValues(raw: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const read = (value: unknown) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== null && typeof entry === "object") continue;
      const normal = fieldKey(key);
      if (!out.has(normal)) out.set(normal, entry);
    }
  };
  read(raw);
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    read((raw as Record<string, unknown>).fields);
  }
  return out;
}

/**
 * `audience_segment` mirrors the RightMessage segment, but Kit fills it with
 * "family" for everyone who never answered (the client's account, read on
 * 2026-10-06). From that field, "family" is not something the member told
 * us, so it never becomes "Because you've told us"; its other values are.
 */
function personaAnswer(values: Map<string, unknown>): Persona | null {
  for (const key of SURVEY_FIELDS.persona) {
    const value = values.get(key);
    if (value === undefined || value === null || value === "") continue;
    const persona = personaFromText(value);
    if (key === "audience_segment" && persona === "family") continue;
    return persona;
  }
  return null;
}

function firstValue(values: Map<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = values.get(key);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

/** A survey answer, matched by value ("busy") or by its label ("Short on time"). */
function vocabularyAnswer(vocabulary: Answer[], value: unknown): string | null {
  const byValue = normalizeAnswer(vocabulary, value);
  if (byValue) return byValue;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  return vocabulary.find((answer) => answer.label.toLowerCase() === text)?.value ?? null;
}

/**
 * A persona from whatever the survey stored. Exact answers first; then the
 * words a segment name is made of ("Busy Professional", "Advanced Cook",
 * "Cooking for others"). Anything else is unknown rather than guessed.
 */
export function personaFromText(value: unknown): Persona | null {
  const exact = vocabularyAnswer(COOK_VIBES, value);
  if (isPersona(exact)) return exact;
  if (typeof value !== "string") return null;
  const text = value.toLowerCase();
  if (/\b(advanced|experienced|expert)\b/.test(text)) return "advanced";
  if (/\b(busy|professional|short on time|no time)\b/.test(text)) return "busy";
  if (/\b(family|families|others|share|sharing|shares|household|kids)\b/.test(text)) return "family";
  if (/\b(new|beginner|newbie|novice|starting out)\b/.test(text)) return "new";
  return null;
}

/** Yes, no, or unknown, from a checkbox, a "Yes"/"No" answer or a phrase. */
export function glutenFreeFromText(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (["yes", "y", "true", "1", "gf", "gluten free", "gluten-free", "glutenfree"].includes(text)) {
    return true;
  }
  if (["no", "n", "false", "0", "none", "not gf"].includes(text)) return false;
  // "Yes, I eat gluten-free" / "No, not me".
  if (/^(yes|y)\b/.test(text)) return true;
  if (/^(no|n)\b/.test(text)) return false;
  const mentionsGluten = /gluten|\bgf\b|celiac|coeliac/.test(text);
  if (mentionsGluten && /\b(not|no|non|don['’]?t|do not|doesn['’]?t)\b/.test(text)) return false;
  if (mentionsGluten) return true;
  return null;
}

/**
 * The traits the crews sync settled on, when the column holds its shape:
 * `{ v: 1, traits: ["gf" | "advanced" | "new"], fields, … }`
 * (`lib/crews/survey-traits.ts`). Null for any other shape.
 */
function crewTraits(raw: unknown): Set<string> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== 1 || !Array.isArray(record.traits)) return null;
  return new Set(record.traits.filter((trait): trait is string => typeof trait === "string"));
}

/**
 * The RightMessage answers from `Profile.surveyTraits`, read defensively.
 *
 * When the crews sync wrote the column, its verdict comes first, so the
 * sentence can never call someone advanced while the crews put them in Nooch
 * Newbies. It only knows advanced, new and gluten-free; the fields it kept
 * (and any other shape of the column) fill in the rest.
 */
export function readSurveyAnswers(raw: unknown): SurveyAnswers {
  const values = surveyValues(raw);
  const fromFields: SurveyAnswers = {
    persona: personaAnswer(values),
    glutenFree: glutenFreeFromText(firstValue(values, SURVEY_FIELDS.glutenFree)),
    primaryBenefit: vocabularyAnswer(PRIMARY_BENEFITS, firstValue(values, SURVEY_FIELDS.primaryBenefit)),
    suckiestThing: vocabularyAnswer(SUCKIEST_THINGS, firstValue(values, SURVEY_FIELDS.suckiestThing)),
  };

  const traits = crewTraits(raw);
  if (!traits) return fromFields;
  // Both at once contradicts itself; then only the segment field itself can say.
  const level: Persona | null =
    traits.has("advanced") && !traits.has("new")
      ? "advanced"
      : traits.has("new") && !traits.has("advanced")
        ? "new"
        : null;
  return {
    ...fromFields,
    persona: level ?? fromFields.persona,
    glutenFree: traits.has("gf") ? true : fromFields.glutenFree,
  };
}

// ---------------------------------------------------------------------------
// Putting it together

export type AnswerSource = "roadmap" | "survey" | "profile";

export type PersonalisationInput = {
  /** `Profile.cookVibe` etc.: what the member answered in the app. */
  cookVibe: string | null;
  glutenFree: boolean | null;
  primaryBenefit: string | null;
  suckiestThing: string | null;
  /** `Profile.skill`. */
  skill?: "BEGINNER" | "CONFIDENT" | "ADVANCED" | null;
  /** The member's DIETARY interest slugs ("gluten-free", …). */
  dietary?: readonly string[];
  /** `Profile.surveyTraits`: the RightMessage answers from Kit. */
  surveyTraits?: unknown;
};

export type Personalisation = {
  persona: Persona | null;
  personaSource: AnswerSource | null;
  glutenFree: boolean | null;
  glutenFreeSource: AnswerSource | null;
  /** Framing key for milestone text (§14 "Primary Benefit = Framing"). */
  primaryBenefit: string | null;
  /** Constraint key for milestone text (§14 "Suckiest Thing = Constraint"). */
  suckiestThing: string | null;
  /** Whether any answer at all is known. */
  known: boolean;
  sentence: string;
};

export function resolvePersonalisation(input: PersonalisationInput): Personalisation {
  const survey = readSurveyAnswers(input.surveyTraits);

  const own = normalizeAnswer(COOK_VIBES, input.cookVibe);
  const ownPersona = isPersona(own) ? own : null;
  // Skill is a level, not a lifestyle: it can say "advanced" or "new", but
  // never "busy" or "cooks for others", and "confident" says neither.
  const skillPersona: Persona | null =
    input.skill === "ADVANCED" ? "advanced" : input.skill === "BEGINNER" ? "new" : null;
  const personaSignals: { value: Persona | null; source: AnswerSource }[] = [
    { value: ownPersona, source: "roadmap" },
    { value: survey.persona, source: "survey" },
    { value: skillPersona, source: "profile" },
  ];
  const told = personaSignals.find((signal) => signal.value !== null);
  const persona = told?.value ?? null;

  const glutenSignals: { value: boolean | null; source: AnswerSource }[] = [
    { value: input.glutenFree, source: "roadmap" },
    { value: survey.glutenFree, source: "survey" },
    { value: input.dietary?.includes("gluten-free") ? true : null, source: "profile" },
  ];
  const said =
    glutenSignals.find((signal) => signal.value === true) ??
    glutenSignals.find((signal) => signal.value === false);
  const glutenFree = said?.value ?? null;

  const primaryBenefit =
    normalizeAnswer(PRIMARY_BENEFITS, input.primaryBenefit) ?? survey.primaryBenefit;
  const suckiestThing =
    normalizeAnswer(SUCKIEST_THINGS, input.suckiestThing) ?? survey.suckiestThing;

  return {
    persona,
    personaSource: told?.source ?? null,
    glutenFree,
    glutenFreeSource: said?.source ?? null,
    primaryBenefit,
    suckiestThing,
    known: Boolean(persona || glutenFree !== null || primaryBenefit || suckiestThing),
    sentence: personalisationSentence({ persona, glutenFree }),
  };
}

/**
 * Whether a track is the one a persona points to (§14 "Cook Vibe = Track").
 *
 * The four tracks are named for the four personas (New, Busy, Family,
 * Advanced), so the slug or a whole word of the name carries it. A stored
 * answer that is exactly a track's slug also matches, as it always has.
 */
export function trackMatchesPersona(
  track: { slug: string; name: string },
  persona: Persona | null,
  storedAnswer?: string | null,
): boolean {
  const slug = track.slug.toLowerCase();
  const stored = storedAnswer?.trim().toLowerCase();
  if (stored && slug === stored) return true;
  if (!persona) return false;
  if (slug === persona || slug.split("-").includes(persona)) return true;
  return new RegExp(`\\b${persona}\\b`, "i").test(track.name);
}
