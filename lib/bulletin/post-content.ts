import { richTextToPlain } from "@/lib/content/rich-text";
import type { BulletinCardState } from "@/lib/bulletin/card";
import {
  HAPPENING_KINDS,
  PLACE_CATEGORIES,
  SERVICE_CATEGORIES,
  STILL_ON_MS,
  VEGAN_STATUS,
  isKey,
} from "@/lib/bulletin/vocabulary";

/**
 * What a Bulletin Board item says when it is a post in the Kitchen Table
 * (DEC-078), and when it counts as live.
 *
 * Pure, so the wording, the privacy rule and the live rule are tested without
 * a database. Three rules hold for every post written from here:
 *
 * - **Plain.** The summary is the member's text with the markup taken out,
 *   then escaped, so the post renders exactly that text and nothing a member
 *   typed can become a heading, a link or raw HTML on someone else's feed.
 * - **City only.** A gathering's address is encrypted and a place's street
 *   address stays on the board; neither is an input here, so neither can leak
 *   into a post, a notification or the search index.
 * - **Short.** The post is the summary; the full item lives on the board.
 */

/** How much of the member's description the post carries. */
export const POST_EXCERPT = 280;
/** How much the Kitchen Table card shows under the title. */
export const CARD_EXCERPT = 200;

/** Collapses whitespace and cuts at a word boundary, with an ellipsis. */
export function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const kept = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s.,;:!?·-]+$/, "")}…`;
}

/**
 * Markdown source that renders as exactly this text.
 *
 * Inline markers are escaped wherever they are; block markers (headings,
 * quotes, list bullets, numbered lists) only where markdown reads them, at the
 * start of a line. `<` is escaped too, so no tag survives even before the
 * sanitiser sees it, and a bare web address stays words rather than becoming
 * a link on somebody else's feed.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/([\\`*_[\]<>~|&])/g, "\\$1")
    .replace(/^([ \t]*)([#+=-])/gm, "$1\\$2")
    .replace(/^([ \t]*\d+)([.)])/gm, "$1\\$2")
    .replace(/\b(https?|ftp):\/\//gi, "$1\\://")
    .replace(/\bwww\./gi, (match) => `${match.slice(0, 3)}\\.`)
    .replace(/@[\w-]+(?:\.[\w-]+)+/g, (address) => address.replace(/\./g, "\\."));
}

/** Member text with no markup at all, on one line. */
export function plainSummary(source: string | null | undefined, max: number): string {
  if (!source) return "";
  return excerpt(richTextToPlain(source), max);
}

const HAPPENING_PHRASE: Record<keyof typeof HAPPENING_KINDS, string> = {
  potluck: "A potluck",
  meal: "A shared meal",
  tea: "A tea",
  class: "A class",
  market: "A market",
  art: "An art gathering",
  volunteer: "A volunteering day",
  other: "A gathering",
};

/** "Potluck", "Catering", "Fully vegan café". */
export function happeningLabel(kind: string): string {
  return isKey(HAPPENING_KINDS, kind) ? HAPPENING_KINDS[kind] : HAPPENING_KINDS.other;
}

export function serviceLabel(category: string | null | undefined): string {
  return isKey(SERVICE_CATEGORIES, category) ? SERVICE_CATEGORIES[category] : "Member service";
}

export function placeLabel(category: string, veganStatus: string): string {
  const status = isKey(VEGAN_STATUS, veganStatus) ? VEGAN_STATUS[veganStatus] : VEGAN_STATUS["vegan-friendly"];
  const kind = isKey(PLACE_CATEGORIES, category) ? PLACE_CATEGORIES[category] : "Place";
  return `${status} ${kind.toLowerCase()}`;
}

export type BulletinPostSource =
  | {
      kind: "happening";
      title: string;
      happeningKind: string;
      city: string;
      description: string | null;
    }
  | {
      kind: "service";
      title: string;
      category: string | null;
      city: string | null;
      body: string;
    }
  | {
      kind: "place";
      name: string;
      category: string;
      veganStatus: string;
      city: string;
    };

export type BulletinPostContent = {
  title: string;
  /** Markdown source, escaped so it renders as plain text. */
  body: string;
  plainText: string;
};

function oneLine(value: string | null | undefined, max: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** The title and the plain summary the Kitchen Table post carries. */
export function bulletinPostContent(source: BulletinPostSource): BulletinPostContent {
  let title: string;
  let lead: string;
  let detail = "";

  if (source.kind === "happening") {
    title = oneLine(source.title, 120);
    const phrase = isKey(HAPPENING_PHRASE, source.happeningKind)
      ? HAPPENING_PHRASE[source.happeningKind]
      : HAPPENING_PHRASE.other;
    lead = `${phrase} in ${oneLine(source.city, 80)}, on the Bulletin Board.`;
    detail = plainSummary(source.description, POST_EXCERPT);
  } else if (source.kind === "service") {
    title = oneLine(source.title, 120);
    const city = oneLine(source.city, 80);
    lead = `${serviceLabel(source.category)}${city ? ` in ${city}` : " online"}, on the Bulletin Board.`;
    detail = plainSummary(source.body, POST_EXCERPT);
  } else {
    title = oneLine(source.name, 120);
    lead = `${placeLabel(source.category, source.veganStatus)} in ${oneLine(source.city, 80)}, on the Bulletin Board.`;
  }

  return {
    title: title || "Bulletin Board",
    body: detail ? `${escapeMarkdown(lead)}\n\n${escapeMarkdown(detail)}` : escapeMarkdown(lead),
    plainText: detail ? `${lead} ${detail}` : lead,
  };
}

/* ------------------------------------------------------------------------ */
/* When an item is live                                                     */
/* ------------------------------------------------------------------------ */

/**
 * The same rules the board's own queries use, written once more as functions
 * so the Kitchen Table card can say why something is no longer there. The
 * integration tests hold the two in step.
 */
export function happeningState(
  row: { canceledAt: Date | null; startsAt: Date },
  now: Date = new Date(),
): Extract<BulletinCardState, "live" | "past" | "canceled"> {
  if (row.canceledAt) return "canceled";
  if (row.startsAt.getTime() < now.getTime() - STILL_ON_MS) return "past";
  return "live";
}

export function serviceState(row: {
  status: string;
  ownerActive: boolean;
}): Extract<BulletinCardState, "live" | "review" | "withdrawn" | "unlisted"> {
  if (row.status === "withdrawn") return "withdrawn";
  if (row.status === "pending") return "review";
  if (row.status === "approved" && row.ownerActive) return "live";
  return "unlisted";
}

export function placeState(row: { status: string }): Extract<BulletinCardState, "live" | "unlisted"> {
  return row.status === "approved" ? "live" : "unlisted";
}
