import { parseCsv, pickColumn, type CsvRow } from "@/lib/csv";
import { youTubeEmbed } from "@/lib/marketing/teasers";

/**
 * Matching the client's class spreadsheet against our own course catalog.
 *
 * The sheet is maintained by hand in Google Sheets, so the class names in it
 * drift from ours in small ways — curly apostrophes, an ampersand where we
 * spell out "and", a trailing "Cooking Class". Matching therefore happens on a
 * normalised form rather than the raw string.
 *
 * What it deliberately does NOT do is guess. A row that only *nearly* matches a
 * course is reported as a suggestion for a human to confirm, never applied.
 * Silently attaching the wrong dish photo to a class is far worse than leaving
 * the card in its honest "photo needed" state, which is also why unmatched
 * classes are reported rather than filled with something plausible.
 */

export type ClassMediaRow = {
  /** The class name exactly as the client typed it. */
  className: string;
  thumbnailUrl: string | null;
  teaserUrl: string | null;
};

export type CourseLike = {
  slug: string;
  title: string;
};

export type MediaMatch = {
  row: ClassMediaRow;
  course: CourseLike;
};

export type MediaSuggestion = {
  row: ClassMediaRow;
  course: CourseLike;
  score: number;
};

export type MatchReport = {
  /** Sheet rows that matched exactly one course. Safe to apply. */
  matched: MediaMatch[];
  /** Sheet rows with no confident match, plus the closest course if any. */
  unmatchedRows: MediaSuggestion[];
  /** Courses in our catalog that the sheet says nothing about. */
  missingCourses: CourseLike[];
  /** Sheet rows whose normalised name collides with another row. */
  duplicateRows: ClassMediaRow[];
};

/**
 * Reduces a class name to the form used for comparison: lowercase, ASCII
 * punctuation, no filler. Both sides of every comparison go through this.
 */
export function normalizeClassName(value: string): string {
  return (
    value
      .normalize("NFKD")
      // Strip combining accents — "Sauté" and "Saute" are the same class.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      // Curly quotes flatten to ASCII, then apostrophes are deleted rather
      // than spaced out: the sheet writes "Mother's Day" and the catalog may
      // write "Mothers Day", and turning the apostrophe into a space would
      // leave "mother s day", which matches neither.
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/'/g, "")
      .replace(/&/g, " and ")
      .replace(/\+/g, " plus ")
      // Everything that is not a letter, digit or space becomes a space, so
      // "Cook-Along", "Cook Along" and "Cook/Along" agree.
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
  );
}

/**
 * A looser key that also drops words carrying no meaning in a catalog of
 * cooking classes. Used only to *suggest* a match, never to apply one.
 */
function loosenKey(value: string): string {
  const FILLER = new Set([
    "the", "a", "an", "and", "of", "for", "with", "your",
    "class", "classes", "cooking", "cook", "course", "workshop",
    "masterclass", "pack", "bundle", "vegan", "plant", "based",
  ]);
  return normalizeClassName(value)
    .split(" ")
    .filter((word) => word && !FILLER.has(word))
    .sort()
    .join(" ");
}

/** Dice coefficient over character bigrams: 1 is identical, 0 shares nothing. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (value: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < value.length - 1; i += 1) {
      const pair = value.slice(i, i + 2);
      out.set(pair, (out.get(pair) ?? 0) + 1);
    }
    return out;
  };
  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;
  let leftTotal = 0;
  for (const count of left.values()) leftTotal += count;
  let rightTotal = 0;
  for (const [pair, count] of right) {
    rightTotal += count;
    shared += Math.min(count, left.get(pair) ?? 0);
  }
  return (2 * shared) / (leftTotal + rightTotal);
}

/** Reads the client's sheet export. Blank media cells become null, not "". */
export function parseClassMediaCsv(text: string): ClassMediaRow[] {
  const rows: ClassMediaRow[] = [];
  for (const row of parseCsv(text) as CsvRow[]) {
    const className = pickColumn(row, [
      "class_name",
      "class name",
      "class",
      "name",
      "title",
    ]);
    if (!className) continue;

    const thumbnailUrl = pickColumn(row, [
      "thumbnail_url",
      "thumbnail image url (1200x1200)",
      "thumbnail image url",
      "thumbnail",
      "photo_url",
      "photo",
      "image",
      "image_url",
    ]);
    const teaserUrl = pickColumn(row, [
      "teaser_url",
      "teaser video (youtube embed url)",
      "teaser video",
      "teaser",
      "video",
      "video_url",
      "youtube",
    ]);

    rows.push({
      className: className.trim(),
      thumbnailUrl: isUsableUrl(thumbnailUrl) ? thumbnailUrl.trim() : null,
      teaserUrl: isUsableUrl(teaserUrl) ? teaserUrl.trim() : null,
    });
  }
  return rows;
}

function isUsableUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Reads the alias file: sheet spelling -> course slug.
 *
 * This is how a name the matcher will not pair on its own gets paired anyway.
 * It exists so those decisions are made once, by a person, in a file that can
 * be reviewed in a diff — rather than by loosening the matcher until it starts
 * guessing, which is how the wrong dish photo ends up on the wrong class.
 */
export function parseClassAliases(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of parseCsv(text) as CsvRow[]) {
    const from = pickColumn(row, ["sheet_class_name", "sheet_name", "from"]);
    const slug = pickColumn(row, ["course_slug", "slug", "to"]);
    if (from && slug) map.set(normalizeClassName(from), slug.trim());
  }
  return map;
}

/**
 * The normalised teaser we would store for a row: a canonical YouTube embed
 * where the link is YouTube, and otherwise the URL untouched so a self-hosted
 * file still works.
 */
export function teaserForStorage(row: ClassMediaRow): string | null {
  if (!row.teaserUrl) return null;
  return youTubeEmbed(row.teaserUrl) ?? row.teaserUrl;
}

/** How confident a fuzzy pairing has to be before it is worth showing. */
const SUGGEST_THRESHOLD = 0.6;

/**
 * Pairs sheet rows with courses.
 *
 * Two passes, both exact: first on the normalised name, then on the looser
 * key. Anything still unpaired is only ever reported, with its nearest course
 * attached so a human can judge it quickly.
 */
export function matchClassMedia(
  rows: ClassMediaRow[],
  courses: CourseLike[],
  aliases: Map<string, string> = new Map(),
): MatchReport {
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const byExact = new Map<string, CourseLike[]>();
  const byLoose = new Map<string, CourseLike[]>();
  for (const course of courses) {
    const exact = normalizeClassName(course.title);
    const loose = loosenKey(course.title);
    byExact.set(exact, [...(byExact.get(exact) ?? []), course]);
    byLoose.set(loose, [...(byLoose.get(loose) ?? []), course]);
  }

  const matched: MediaMatch[] = [];
  const unmatchedRows: MediaSuggestion[] = [];
  const duplicateRows: ClassMediaRow[] = [];
  const claimed = new Set<string>();
  const seenRowKeys = new Set<string>();

  for (const row of rows) {
    const exact = normalizeClassName(row.className);
    if (seenRowKeys.has(exact)) {
      duplicateRows.push(row);
      continue;
    }
    seenRowKeys.add(exact);

    // An alias is a decision someone already made, so it outranks everything.
    const aliased = aliases.get(exact);
    if (aliased) {
      const course = bySlug.get(aliased);
      if (course && !claimed.has(course.slug)) {
        matched.push({ row, course });
        claimed.add(course.slug);
        continue;
      }
    }

    // Only a single unambiguous hit counts. Two courses sharing a normalised
    // name is a catalog problem, and picking one at random would hide it.
    const exactHits = byExact.get(exact) ?? [];
    const looseHits = exactHits.length ? [] : (byLoose.get(loosenKey(row.className)) ?? []);
    const hits = exactHits.length ? exactHits : looseHits;

    if (hits.length === 1 && !claimed.has(hits[0].slug)) {
      matched.push({ row, course: hits[0] });
      claimed.add(hits[0].slug);
      continue;
    }

    let best: CourseLike | null = null;
    let bestScore = 0;
    for (const course of courses) {
      if (claimed.has(course.slug)) continue;
      const score = similarity(exact, normalizeClassName(course.title));
      if (score > bestScore) {
        bestScore = score;
        best = course;
      }
    }
    if (best && bestScore >= SUGGEST_THRESHOLD) {
      unmatchedRows.push({ row, course: best, score: bestScore });
    } else if (best) {
      unmatchedRows.push({ row, course: best, score: bestScore });
    }
  }

  const missingCourses = courses.filter((course) => !claimed.has(course.slug));

  return { matched, unmatchedRows, missingCourses, duplicateRows };
}
