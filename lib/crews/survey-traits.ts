/**
 * RightMessage survey answers → crew traits (DEC-078).
 *
 * The answers live in Kit custom fields. The client's account (read on
 * 2026-10-06) keeps them in `gluten_free` ("true" / "false") and
 * `rm_audience_segment` ("advanced", "new", "busy", "family"), with
 * `audience_segment` mirroring the segment but defaulting to "family" for
 * people who never answered. The default rule reads exactly those fields:
 *
 *   gf        gluten_free is yes-like ("true", "yes", "GF")
 *   advanced  rm_audience_segment, else audience_segment, is "advanced"
 *   new       rm_audience_segment, else audience_segment, is "new"
 *
 * It deliberately does not read every field: a UTM field holding "new" is not
 * a survey answer, and must not put anyone in Nooch Newbies.
 *
 * `KIT_SURVEY_FIELDS` overrides a trait's rule if the fields ever change.
 *
 * `KIT_SURVEY_FIELDS` is a comma-separated list. Each entry is one of:
 *
 *   gf                                  the default rule for that trait
 *   gf=dietary_needs                    field `dietary_needs` has a yes-like value
 *   gf=dietary_needs:gluten free|gf     field `dietary_needs` is one of these
 *   advanced=cooking_level:advanced
 *   new=cooking_level:new|beginner
 *
 * Field names may be written as Kit's key (`dietary_needs`) or its label
 * ("Dietary needs"); both compare the same. A trait the setting does not
 * mention keeps the default rule. `gf,advanced,new` (the `.env.example`
 * value) is therefore the same as not setting it.
 *
 * Pure: no Kit, no database. The sync in `kit-survey.ts` feeds it.
 */

export const SURVEY_TRAITS = ["gf", "advanced", "new"] as const;
export type SurveyTrait = (typeof SURVEY_TRAITS)[number];

/** The crew each trait fills. Seeded by the client-feedback migration. */
export const TRAIT_RULE_KEYS: Record<SurveyTrait, string> = {
  gf: "trait:gf",
  advanced: "trait:advanced",
  new: "trait:new",
};

export const TRAIT_CREWS: Record<
  SurveyTrait,
  { slug: string; name: string; description: string; sortOrder: number }
> = {
  gf: {
    slug: "gluten-free-gang",
    name: "Gluten-Free Gang",
    description: "Cooking gluten-free, and comparing notes on what actually works.",
    sortOrder: 10,
  },
  advanced: {
    slug: "advanced-cooking-crew",
    name: "Advanced Cooking Crew",
    description: "For cooks on the more advanced side who want the harder projects.",
    sortOrder: 11,
  },
  new: {
    slug: "nooch-newbies",
    name: "Nooch Newbies",
    description: "New to vegan cooking. Every question is a good one here.",
    sortOrder: 12,
  },
};

/**
 * The default rule per trait: the client's RightMessage fields, in the order
 * they are believed. `values: null` means a yes/no answer.
 */
const DEFAULT_FIELD_RULES: Record<SurveyTrait, { field: string; values: string[] | null }[]> = {
  gf: [{ field: "gluten_free", values: null }],
  advanced: [
    { field: "rm_audience_segment", values: ["advanced"] },
    { field: "audience_segment", values: ["advanced"] },
  ],
  new: [
    { field: "rm_audience_segment", values: ["new"] },
    { field: "audience_segment", values: ["new"] },
  ],
};

/**
 * Survey answers kept on the member whether or not they make a crew trait:
 * the roadmap's one-sentence personalisation reads the persona ("busy",
 * "family"), the gluten-free answer and the primary benefit from these.
 */
export const SURVEY_CONTEXT_FIELDS = [
  "gluten_free",
  "rm_audience_segment",
  "audience_segment",
  "q_primary_benefit",
  "q_suckiest_thing",
] as const;

const TRAIT_ALIASES: Record<string, SurveyTrait> = {
  gf: "gf",
  "gluten-free": "gf",
  gluten_free: "gf",
  glutenfree: "gf",
  advanced: "advanced",
  new: "new",
  newbie: "new",
  newbies: "new",
};

export type TraitRule =
  | { trait: SurveyTrait; kind: "default" }
  | { trait: SurveyTrait; kind: "field"; field: string; values: string[] | null };

export type SurveyMapping = {
  rules: TraitRule[];
  /** False when the defaults are in force (nothing set, or only bare traits). */
  configured: boolean;
  /** Entries that could not be read, so the console can show them. */
  problems: string[];
  /**
   * A short fingerprint of the rules. Stored with each member's answers, so a
   * changed mapping marks every member stale and the next sync re-reads them.
   */
  key: string;
};

export function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function fingerprint(text: string): string {
  // djb2: enough to notice a change, not a security property.
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function parseSurveyMapping(raw: string | null | undefined): SurveyMapping {
  const rules: TraitRule[] = [];
  const problems: string[] = [];
  let configured = false;

  for (const entry of (raw ?? "").split(/[,;\n]+/)) {
    const text = entry.trim();
    if (!text) continue;
    const eq = text.indexOf("=");
    const traitToken = (eq === -1 ? text : text.slice(0, eq)).trim().toLowerCase();
    const trait = TRAIT_ALIASES[traitToken];
    if (!trait) {
      problems.push(`"${text}": unknown trait "${traitToken}" (use gf, advanced or new)`);
      continue;
    }
    if (eq === -1) {
      rules.push({ trait, kind: "default" });
      continue;
    }
    const target = text.slice(eq + 1);
    const colon = target.indexOf(":");
    const field = normalizeKey(colon === -1 ? target : target.slice(0, colon));
    if (!field) {
      problems.push(`"${text}": no field name after "="`);
      continue;
    }
    const values =
      colon === -1
        ? null
        : target
            .slice(colon + 1)
            .split("|")
            .map(normalizeValue)
            .filter(Boolean);
    rules.push({ trait, kind: "field", field, values: values && values.length > 0 ? values : null });
    configured = true;
  }

  // A trait nobody mentioned keeps the default rule.
  for (const trait of SURVEY_TRAITS) {
    if (!rules.some((rule) => rule.trait === trait)) rules.push({ trait, kind: "default" });
  }

  const canonical = rules
    .map((rule) =>
      rule.kind === "default"
        ? `${rule.trait}:rm-v2`
        : `${rule.trait}=${rule.field}:${(rule.values ?? ["<yes>"]).join("|")}`,
    )
    .sort()
    .join(",");

  return { rules, configured, problems, key: fingerprint(canonical) };
}

/** The mapping in force, from the environment. */
export function surveyMappingFromEnv(): SurveyMapping {
  return parseSurveyMapping(process.env.KIT_SURVEY_FIELDS);
}

const NEGATIVE = new Set([
  "",
  "-",
  "0",
  "false",
  "n",
  "n/a",
  "na",
  "no",
  "none",
  "nope",
  "not",
  "null",
  "off",
  "undefined",
]);

function isYes(value: string): boolean {
  return !NEGATIVE.has(normalizeValue(value));
}

/** One answer can carry several choices: "GF, Dairy-free" or "GF | Soy-free". */
function answerParts(value: string): string[] {
  const whole = normalizeValue(value);
  const parts = whole
    .split(/[,;|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return [whole, ...parts];
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(stringValue).filter((part): part is string => part !== null);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

export type TraitMatch = {
  traits: SurveyTrait[];
  /**
   * The fields that produced a trait, plus the survey context fields
   * (SURVEY_CONTEXT_FIELDS), keyed by Kit's field key.
   */
  fields: Record<string, string>;
};

/** The traits a member's Kit custom fields carry under `mapping`. */
export function traitsFromFields(
  rawFields: Record<string, unknown> | null | undefined,
  mapping: SurveyMapping,
): TraitMatch {
  const entries: { original: string; key: string; value: string }[] = [];
  for (const [original, raw] of Object.entries(rawFields ?? {})) {
    const value = stringValue(raw);
    if (value === null || !value.trim()) continue;
    entries.push({ original, key: normalizeKey(original), value });
  }

  const traits = new Set<SurveyTrait>();
  const fields: Record<string, string> = {};
  const hit = (trait: SurveyTrait, entry: { original: string; value: string }) => {
    traits.add(trait);
    fields[entry.original] = entry.value.slice(0, 200);
  };

  for (const rule of mapping.rules) {
    if (rule.kind === "field") {
      for (const entry of entries) {
        if (entry.key !== rule.field) continue;
        if (rule.values === null) {
          if (isYes(entry.value)) hit(rule.trait, entry);
        } else if (answerParts(entry.value).some((part) => rule.values!.includes(part))) {
          hit(rule.trait, entry);
        }
      }
      continue;
    }

    for (const fieldRule of DEFAULT_FIELD_RULES[rule.trait]) {
      const entry = entries.find((candidate) => candidate.key === fieldRule.field);
      if (!entry) continue;
      const matched =
        fieldRule.values === null
          ? isYes(entry.value)
          : answerParts(entry.value).some((part) => fieldRule.values!.includes(part));
      if (matched) {
        hit(rule.trait, entry);
        break;
      }
    }
  }

  // The persona and onboarding answers ride along for the roadmap.
  for (const entry of entries) {
    if ((SURVEY_CONTEXT_FIELDS as readonly string[]).includes(entry.key) && !(entry.original in fields)) {
      fields[entry.original] = entry.value.slice(0, 200);
    }
  }

  return {
    traits: SURVEY_TRAITS.filter((trait) => traits.has(trait)),
    fields,
  };
}

/** What `Profile.surveyTraits` holds once the Kit sync has run. */
export type StoredSurveyTraits = {
  v: 1;
  /** Whether Kit had a subscriber with the member's address. */
  found: boolean;
  traits: SurveyTrait[];
  fields: Record<string, string>;
  /** `SurveyMapping.key` the traits were derived under. */
  mapping: string;
};

export function storedSurveyTraits(input: {
  found: boolean;
  match: TraitMatch;
  mapping: SurveyMapping;
}): StoredSurveyTraits {
  return {
    v: 1,
    found: input.found,
    traits: input.match.traits,
    fields: input.match.fields,
    mapping: input.mapping.key,
  };
}

/** Reads the stored shape, tolerating anything else in the column. */
export function readStoredSurveyTraits(raw: unknown): StoredSurveyTraits | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== 1) return null;
  const traits = Array.isArray(record.traits)
    ? SURVEY_TRAITS.filter((trait) => (record.traits as unknown[]).includes(trait))
    : [];
  const fields: Record<string, string> = {};
  if (record.fields && typeof record.fields === "object" && !Array.isArray(record.fields)) {
    for (const [key, value] of Object.entries(record.fields as Record<string, unknown>)) {
      if (typeof value === "string") fields[key] = value;
    }
  }
  return {
    v: 1,
    found: record.found === true,
    traits,
    fields,
    mapping: typeof record.mapping === "string" ? record.mapping : "",
  };
}

/** Human-readable rules, for the console. */
export function describeRule(rule: TraitRule): string {
  if (rule.kind === "default") {
    return DEFAULT_FIELD_RULES[rule.trait]
      .map((fieldRule) =>
        fieldRule.values
          ? `field "${fieldRule.field}" is ${fieldRule.values.map((value) => `"${value}"`).join(" or ")}`
          : `field "${fieldRule.field}" answered yes`,
      )
      .join(", else ");
  }
  return rule.values
    ? `field "${rule.field}" is ${rule.values.map((value) => `"${value}"`).join(" or ")}`
    : `field "${rule.field}" answered yes`;
}
