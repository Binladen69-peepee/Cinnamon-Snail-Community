import type { InterestKind } from "@prisma/client";

/**
 * The interest vocabulary.
 *
 * Interests used to be a free-text JSON array, which meant fourteen members
 * produced thirty-three distinct strings — "bbq" and "grilling", "soups" and
 * "broth", "basics" and "technique" — none of which Postgres could index,
 * aggregate or filter. The directory's interest filter ran over one page of
 * results and its facet list was hardcoded empty, because offering filters
 * built from a single page would advertise something the filter does not do.
 * PROJECT.md listed it as known limit 3.
 *
 * So the list is curated. This file is the source of truth; `syncInterests`
 * mirrors it into the `Interest` table, which is what the database joins and
 * counts against. Keeping it in code rather than only in rows means the
 * vocabulary is reviewable in a diff — adding a cuisine is a pull request,
 * not an INSERT nobody saw.
 *
 * Five kinds, because those are the five useful questions: what you cook,
 * how you cook it, what you cannot eat, what you cook with, and what you are
 * trying to get better at. Matching later wants all five.
 */

export type InterestOption = {
  slug: string;
  label: string;
  kind: InterestKind;
};

export const INTEREST_KINDS = [
  "CUISINE",
  "TECHNIQUE",
  "DIETARY",
  "EQUIPMENT",
  "GOAL",
] as const;

export const INTEREST_KIND_LABELS: Record<InterestKind, string> = {
  CUISINE: "Cuisines",
  TECHNIQUE: "Techniques",
  DIETARY: "Dietary needs",
  EQUIPMENT: "Equipment",
  GOAL: "Goals",
};

/**
 * The catalog.
 *
 * Deliberately finite. A picker with forty options is one somebody reads; a
 * text box is one that produces "bbq", "BBQ", "barbeque" and "grilling" as
 * four unrelated values, which is exactly what the existing data looks like.
 *
 * Order within a kind is the order it is offered in, so the common ones lead.
 */
export const INTERESTS: InterestOption[] = [
  // --- what you cook ------------------------------------------------------
  { slug: "japanese", label: "Japanese", kind: "CUISINE" },
  { slug: "indian", label: "Indian", kind: "CUISINE" },
  { slug: "mexican", label: "Mexican", kind: "CUISINE" },
  { slug: "italian", label: "Italian", kind: "CUISINE" },
  { slug: "mediterranean", label: "Mediterranean", kind: "CUISINE" },
  { slug: "middle-eastern", label: "Middle Eastern", kind: "CUISINE" },
  { slug: "west-african", label: "West African", kind: "CUISINE" },
  { slug: "ethiopian", label: "Ethiopian", kind: "CUISINE" },
  { slug: "thai", label: "Thai", kind: "CUISINE" },
  { slug: "chinese", label: "Chinese", kind: "CUISINE" },
  { slug: "korean", label: "Korean", kind: "CUISINE" },
  { slug: "caribbean", label: "Caribbean", kind: "CUISINE" },

  // --- how you cook it ----------------------------------------------------
  { slug: "baking", label: "Baking", kind: "TECHNIQUE" },
  { slug: "pastry", label: "Pastry and desserts", kind: "TECHNIQUE" },
  { slug: "bread", label: "Bread", kind: "TECHNIQUE" },
  { slug: "fermentation", label: "Fermentation", kind: "TECHNIQUE" },
  { slug: "grilling", label: "Grilling and barbecue", kind: "TECHNIQUE" },
  { slug: "braising", label: "Braises and stews", kind: "TECHNIQUE" },
  { slug: "soups-and-broths", label: "Soups and broths", kind: "TECHNIQUE" },
  { slug: "sauces", label: "Sauces", kind: "TECHNIQUE" },
  { slug: "spice-blending", label: "Spice and chilli", kind: "TECHNIQUE" },
  { slug: "tofu-and-tempeh", label: "Tofu and tempeh", kind: "TECHNIQUE" },
  { slug: "pasta", label: "Pasta and noodles", kind: "TECHNIQUE" },
  { slug: "knife-skills", label: "Knife skills", kind: "TECHNIQUE" },
  { slug: "preserving", label: "Preserving and pickling", kind: "TECHNIQUE" },
  { slug: "steaming", label: "Steaming", kind: "TECHNIQUE" },

  // --- what you cannot eat ------------------------------------------------
  { slug: "gluten-free", label: "Gluten free", kind: "DIETARY" },
  { slug: "soy-free", label: "Soy free", kind: "DIETARY" },
  { slug: "nut-free", label: "Nut free", kind: "DIETARY" },
  { slug: "oil-free", label: "Oil free", kind: "DIETARY" },
  { slug: "refined-sugar-free", label: "No refined sugar", kind: "DIETARY" },
  { slug: "low-sodium", label: "Low sodium", kind: "DIETARY" },
  { slug: "high-protein", label: "High protein", kind: "DIETARY" },
  { slug: "raw", label: "Raw", kind: "DIETARY" },

  // --- what you cook with -------------------------------------------------
  { slug: "cast-iron", label: "Cast iron", kind: "EQUIPMENT" },
  { slug: "pressure-cooker", label: "Pressure cooker", kind: "EQUIPMENT" },
  { slug: "air-fryer", label: "Air fryer", kind: "EQUIPMENT" },
  { slug: "wok", label: "Wok", kind: "EQUIPMENT" },
  { slug: "stand-mixer", label: "Stand mixer", kind: "EQUIPMENT" },
  { slug: "blender", label: "High-speed blender", kind: "EQUIPMENT" },
  { slug: "dehydrator", label: "Dehydrator", kind: "EQUIPMENT" },
  { slug: "smoker", label: "Smoker", kind: "EQUIPMENT" },

  // --- what you are working on --------------------------------------------
  { slug: "weeknight-dinners", label: "Weeknight dinners", kind: "GOAL" },
  { slug: "batch-cooking", label: "Batch cooking", kind: "GOAL" },
  { slug: "meal-prep", label: "Meal prep", kind: "GOAL" },
  { slug: "budget-cooking", label: "Cooking on a budget", kind: "GOAL" },
  { slug: "cooking-basics", label: "The basics", kind: "GOAL" },
  { slug: "flavour-building", label: "Building flavour", kind: "GOAL" },
  { slug: "entertaining", label: "Feeding a crowd", kind: "GOAL" },
  { slug: "feeding-a-family", label: "Feeding a family", kind: "GOAL" },
];

/** How many a member may pick. Enough to be useful, few enough to mean something. */
export const MAX_INTERESTS_PER_MEMBER = 12;

const BY_SLUG = new Map(INTERESTS.map((option) => [option.slug, option]));

export function interestBySlug(slug: string): InterestOption | null {
  return BY_SLUG.get(slug.trim().toLowerCase()) ?? null;
}

/** Keeps only slugs that are in the catalog, deduped, capped. */
export function sanitiseInterestSlugs(slugs: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of slugs) {
    const slug = String(raw).trim().toLowerCase();
    if (!BY_SLUG.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= MAX_INTERESTS_PER_MEMBER) break;
  }
  return out;
}

export function interestsByKind(): { kind: InterestKind; options: InterestOption[] }[] {
  return INTEREST_KINDS.map((kind) => ({
    kind,
    options: INTERESTS.filter((option) => option.kind === kind),
  }));
}

/**
 * What the free-text column meant, as far as it can be known.
 *
 * Every one of the thirty-three strings members actually wrote is here, and
 * the judgement calls are the point of writing it down: "ramen" and "masa"
 * are dishes rather than cuisines, "technique" and "citrus" are barely
 * anything at all. Each maps to the nearest catalog entry rather than being
 * dropped, and the migration prints what it did so the mapping is reviewable
 * rather than silent.
 *
 * Anything not listed here has no home in the catalog and is reported instead
 * of guessed at.
 */
export const LEGACY_INTEREST_MAP: Record<string, string> = {
  baking: "baking",
  basics: "cooking-basics",
  "batch cooking": "batch-cooking",
  bbq: "grilling",
  bread: "bread",
  broth: "soups-and-broths",
  budget: "budget-cooking",
  citrus: "flavour-building",
  // A dish, not a cuisine — but everyone who wrote it also cooks Indian food.
  curry: "indian",
  dal: "indian",
  desserts: "pastry",
  fermentation: "fermentation",
  "gluten-free": "gluten-free",
  "gluten free": "gluten-free",
  indian: "indian",
  italian: "italian",
  japanese: "japanese",
  // The dough, so the cuisine it belongs to.
  masa: "mexican",
  "meal prep": "meal-prep",
  mediterranean: "mediterranean",
  mexican: "mexican",
  mezze: "middle-eastern",
  "middle eastern": "middle-eastern",
  "middle-eastern": "middle-eastern",
  pasta: "pasta",
  pastry: "pastry",
  peppers: "spice-blending",
  ramen: "japanese",
  salsa: "mexican",
  sauces: "sauces",
  soups: "soups-and-broths",
  spice: "spice-blending",
  steaming: "steaming",
  stews: "braising",
  tahini: "middle-eastern",
  // Too vague to be a tag on its own; the nearest concrete skill.
  technique: "knife-skills",
  tofu: "tofu-and-tempeh",
  umami: "flavour-building",
  "weeknight dinners": "weeknight-dinners",
  "west african": "west-african",
  "west-african": "west-african",
};

export function mapLegacyInterest(value: string): string | null {
  const key = value.trim().toLowerCase();
  const mapped = LEGACY_INTEREST_MAP[key];
  if (mapped) return mapped;
  // A value that already is a catalog slug needs no mapping.
  return BY_SLUG.has(key) ? key : null;
}
