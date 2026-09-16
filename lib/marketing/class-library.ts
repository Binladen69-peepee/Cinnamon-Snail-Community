/**
 * Homepage class library.
 *
 * Source of truth is `data/class_thumbnails_and_teasers.xlsx` (Class Name,
 * Thumbnail Image URL, Teaser Video YouTube Embed URL), exported as
 * `data/class-library.json`. Teaser lengths (`durationSeconds`) are read from
 * YouTube for those embed ids — never invented. The homepage slider must not
 * substitute Prisma covers, stock photos, or generated media.
 */

import rows from "@/data/class-library.json";
import { isStockImageUrl } from "@/lib/marketing/stock-hosts";

export const SHELF_ORDER = [
  "Regional & World Cuisine",
  "Holidays & Seasonal",
  "Techniques & Substitutes",
  "Baking & Desserts",
  "Weeknights & Comfort",
] as const;

export type ShelfName = (typeof SHELF_ORDER)[number];

export type LibraryClass = {
  title: string;
  thumbnailUrl: string;
  teaserUrl: string;
  slug: string;
  durationSeconds: number | null;
};

export type LibraryShelf = {
  name: ShelfName;
  classes: LibraryClass[];
};

const SHELF_BY_TITLE: Record<string, ShelfName> = {
  "2023 Vegan Christmas Dinner Class": "Holidays & Seasonal",
  "2023 Vegan Thanksgiving Cooking Class": "Holidays & Seasonal",
  "A Colosseum of Vegan Eggs": "Techniques & Substitutes",
  "A Vegan Hanukkah Kitchen: Root Veggies & Rituals": "Holidays & Seasonal",
  "Approachable Vegan Desserts": "Baking & Desserts",
  "Around the World in Vegan Donuts": "Baking & Desserts",
  "Bangin' Tex-Mex Casseroles": "Weeknights & Comfort",
  "Eastern European Jewish Vegan Food": "Regional & World Cuisine",
  "Easy, Healthy Vegan Lunches": "Weeknights & Comfort",
  "Essential Mexican Salsas": "Techniques & Substitutes",
  "Gluten-Free Vegan Masterclass": "Techniques & Substitutes",
  "Homestyle Moroccan Cooking": "Regional & World Cuisine",
  "Legacy Vegan Cooking Class": "Weeknights & Comfort",
  "Make Better Meat, Vegan": "Techniques & Substitutes",
  "Make the Best Plant-Based Pizza": "Weeknights & Comfort",
  "Malaysian Vegan Cuisine": "Regional & World Cuisine",
  "Plant-Based Cheese School": "Techniques & Substitutes",
  "Punjabi Thali Cuisine": "Regional & World Cuisine",
  "Saigon Flavor: Vegan Vietnamese Cooking Class": "Regional & World Cuisine",
  "Sattvic Vegan Indian Cuisine": "Regional & World Cuisine",
  "Seitan Masterclass": "Techniques & Substitutes",
  "Southern Vegan BBQ Class Pack": "Weeknights & Comfort",
  "Spooky Vegan Halloween Party Prep": "Holidays & Seasonal",
  "The best falafel and vegan meze": "Regional & World Cuisine",
  "The best plant-based tacos": "Weeknights & Comfort",
  "The Green Reaper: Vegan Salad Bible": "Weeknights & Comfort",
  "The Perfect Vegan Brunch Cooking Class": "Weeknights & Comfort",
  "Vegan Cake Donut Mastery": "Baking & Desserts",
  "Vegan Christmas Bundle Of Yummy": "Holidays & Seasonal",
  "Vegan Dairy Crash Course": "Techniques & Substitutes",
  "Vegan Dim Sum and Then Some": "Regional & World Cuisine",
  "Vegan Easter Dinner Class": "Holidays & Seasonal",
  "Vegan Empanadas Made Easy": "Baking & Desserts",
  "Vegan Filipino Cooking Class": "Regional & World Cuisine",
  "Vegan Freezer Meals": "Weeknights & Comfort",
  "Vegan Indonesian BBQ": "Regional & World Cuisine",
  "Vegan Italian American Cooking Class": "Regional & World Cuisine",
  "Vegan Italian Desserts": "Baking & Desserts",
  "Vegan Korean Fried Chicken Workshop": "Regional & World Cuisine",
  "Vegan Mediterranean Cooking Class": "Regional & World Cuisine",
  "Vegan Mexican Cooking": "Regional & World Cuisine",
  "Vegan Mother's Day Cook-Along Brunch": "Holidays & Seasonal",
  "Vegan Passover Prep-Along": "Holidays & Seasonal",
  "Vegan Sandwich Hall of Fame Cooking Class": "Weeknights & Comfort",
  "Vegan Shabbat Dinner": "Holidays & Seasonal",
  "Vegan Soup Workshop": "Weeknights & Comfort",
  "Vegan Thai Kitchen Adventures": "Regional & World Cuisine",
  "Vegan Thanksgiving Training Camp": "Holidays & Seasonal",
  "Vegan Turkish Cuisine": "Regional & World Cuisine",
  "Vegan Valentine's Treats": "Holidays & Seasonal",
  "Veganized Chinese Takeout Classics": "Regional & World Cuisine",
};

export function classSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const CLASS_LIBRARY: LibraryClass[] = (
  rows as Array<{
    title: string;
    thumbnailUrl: string;
    teaserUrl: string;
    durationSeconds?: number | null;
  }>
).map((row) => ({
  title: row.title,
  thumbnailUrl: row.thumbnailUrl,
  teaserUrl: row.teaserUrl,
  slug: classSlug(row.title),
  durationSeconds:
    typeof row.durationSeconds === "number" &&
    Number.isFinite(row.durationSeconds) &&
    row.durationSeconds > 0
      ? Math.round(row.durationSeconds)
      : null,
}));

/** Real teaser length from YouTube, or null when the sheet has no duration. */
export function formatClassLength(
  seconds: number | null | undefined,
): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 1) return null;
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function shelfForTitle(title: string): ShelfName {
  const shelf = SHELF_BY_TITLE[title];
  if (!shelf) throw new Error(`Unshelved class: ${title}`);
  return shelf;
}

export function libraryShelves(): LibraryShelf[] {
  const buckets = new Map<ShelfName, LibraryClass[]>();
  for (const name of SHELF_ORDER) buckets.set(name, []);
  for (const cls of CLASS_LIBRARY) {
    buckets.get(shelfForTitle(cls.title))!.push(cls);
  }
  return SHELF_ORDER.map((name) => {
    const classes = buckets.get(name) ?? [];
    if (classes.length === 0) throw new Error(`Empty shelf: ${name}`);
    return { name, classes };
  });
}

export function classesOnShelf(name: ShelfName | null): LibraryClass[] {
  if (!name) return CLASS_LIBRARY;
  return libraryShelves().find((shelf) => shelf.name === name)?.classes ?? [];
}

export function searchClasses(
  classes: LibraryClass[],
  query: string,
): LibraryClass[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return classes;
  return classes.filter((cls) => cls.title.toLowerCase().includes(needle));
}

export function filterLibrary(
  shelf: ShelfName | null,
  query: string,
): LibraryClass[] {
  return searchClasses(classesOnShelf(shelf), query);
}

/** First five of the current filter, with the Green Reaper up front when it is in the set. */
export const DEFAULT_FEATURED_TITLE = "The Green Reaper: Vegan Salad Bible";

export function featuredPool(classes: LibraryClass[], size = 5): LibraryClass[] {
  const preferred = classes.find((cls) => cls.title === DEFAULT_FEATURED_TITLE);
  const rest = classes.filter((cls) => cls.title !== DEFAULT_FEATURED_TITLE);
  const ordered = preferred ? [preferred, ...rest] : classes;
  return ordered.slice(0, Math.min(size, ordered.length));
}

export type MembershipSlide = {
  title: string;
  photo: string;
};

/**
 * Fifteen plated stills for the membership gallery. Order is the featured
 * pool (Green Reaper first, then spreadsheet order) so this is not a second
 * invented ranking. Photos stay on Adam's WordPress host.
 */
export function membershipGallery(
  classes: LibraryClass[] = CLASS_LIBRARY,
  size = 15,
): MembershipSlide[] {
  const slides: MembershipSlide[] = [];
  for (const cls of featuredPool(classes, classes.length)) {
    if (slides.length >= size) break;
    const photo = resolveClassPhoto(cls.thumbnailUrl);
    if (!photo) continue;
    slides.push({ title: cls.title, photo });
  }
  return slides;
}

export function classDetailHref(slug: string): string {
  return `/learn/${slug}`;
}

/** Spreadsheet stills only. Stock or empty URLs become the designed empty state. */
export function resolveClassPhoto(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  if (isStockImageUrl(url)) return null;
  return url;
}

/** Play the spreadsheet embed after a click, without rewriting the host or id. */
export function playingEmbedSrc(embedUrl: string): string {
  const joiner = embedUrl.includes("?") ? "&" : "?";
  return `${embedUrl}${joiner}autoplay=1&rel=0&playsinline=1`;
}
