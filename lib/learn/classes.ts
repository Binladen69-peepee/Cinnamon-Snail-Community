import {
  CLASS_LIBRARY,
  formatClassLength,
  photoForKnownClass,
} from "@/lib/marketing/class-library";
import { youTubeEmbed } from "@/lib/marketing/teasers";

/**
 * What a class is, everywhere in the member app.
 *
 * A class is assembled from two sources and neither is sufficient alone. The
 * `Course` row owns the title, category, description and instructor. The class
 * sheet owns the still and the teaser — `Course.teaserVideoUrl` is null on all
 * 52 published rows, so a card built only from the database would have no video
 * and, on 19 of them, no image either.
 *
 * They are joined on title, which is what the marketing pages already do. It
 * matches 49 of the 52; the other three still resolve a photograph, because
 * `photoForKnownClass` falls back to the course's own cover and rejects stock.
 *
 * This lives under `lib/learn` rather than beside a page because three surfaces
 * now render a class — the library, a class page, and Discover — and a second
 * copy of this join is a second thing to keep in step.
 */

export type ClassSummary = {
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  instructor: string | null;
  /** A real still. Stock imagery is rejected upstream. */
  photo: string | null;
  /** Privacy-preserving YouTube embed, or null when the sheet has no teaser. */
  teaserEmbed: string | null;
  /** Teaser runtime, not the class runtime. */
  length: string | null;
};

/** The Course columns a class summary needs. One select, three callers. */
export const CLASS_SELECT = {
  slug: true,
  title: true,
  description: true,
  category: true,
  instructorName: true,
  coverUrl: true,
} as const;

export type ClassRow = {
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  instructorName: string | null;
  coverUrl: string | null;
};

const SHEET_BY_TITLE = new Map(
  CLASS_LIBRARY.map((entry) => [entry.title.toLowerCase(), entry]),
);

export function shapeClass(course: ClassRow): ClassSummary {
  const sheet = SHEET_BY_TITLE.get(course.title.trim().toLowerCase());
  return {
    slug: course.slug,
    title: course.title,
    description: course.description,
    category: course.category,
    instructor: course.instructorName,
    photo: photoForKnownClass(course.title, course.coverUrl),
    teaserEmbed: youTubeEmbed(sheet?.teaserUrl),
    length: formatClassLength(sheet?.durationSeconds),
  };
}

/** Where a class lives. One table, so a link cannot drift from the route. */
export function classHref(slug: string): string {
  return `/learn/${slug}`;
}
