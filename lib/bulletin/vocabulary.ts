/**
 * The bulletin board's fixed vocabulary (BUILD.md §19).
 *
 * Pure and client-safe: the tabs, the Kitchen Table card and the tests all
 * read the same labels, and none of them may pull the database in to do it.
 * `lib/bulletin` re-exports everything here, so existing imports keep working.
 */

export const HAPPENING_KINDS = {
  potluck: "Potluck",
  meal: "Shared meal",
  tea: "Tea",
  class: "Class",
  market: "Market",
  art: "Art",
  volunteer: "Volunteer",
  other: "Other",
} as const;
export type HappeningKind = keyof typeof HAPPENING_KINDS;

export const SERVICE_CATEGORIES = {
  lessons: "Cooking lessons",
  catering: "Catering",
  "meal-prep": "Meal prep",
  baking: "Baking",
  photography: "Food photography",
  growing: "Growing",
  other: "Other",
} as const;
export type ServiceCategory = keyof typeof SERVICE_CATEGORIES;

export const PLACE_CATEGORIES = {
  restaurant: "Restaurant",
  cafe: "Café",
  bakery: "Bakery",
  grocery: "Grocery",
  market: "Market",
  "food-truck": "Food truck",
  other: "Other",
} as const;
export type PlaceCategory = keyof typeof PLACE_CATEGORIES;

export const VEGAN_STATUS = {
  "fully-vegan": "Fully vegan",
  "vegan-friendly": "Vegan-friendly",
} as const;
export type VeganStatus = keyof typeof VEGAN_STATUS;

export const BULLETIN_TABS = ["happenings", "services", "places"] as const;
export type BulletinTab = (typeof BULLETIN_TABS)[number];

export function parseTab(value: string | undefined): BulletinTab {
  return (BULLETIN_TABS as readonly string[]).includes(value ?? "")
    ? (value as BulletinTab)
    : "happenings";
}

export function isKey<T extends object>(map: T, value: unknown): value is keyof T {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(map, value);
}

/** A gathering stays listed for a few hours after it starts, while people arrive. */
export const STILL_ON_MS = 3 * 60 * 60 * 1000;
