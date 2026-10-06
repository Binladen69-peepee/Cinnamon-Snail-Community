import { richTextMentions } from "@/lib/content/rich-text";

/**
 * The handles a member-written body mentions: lowercased, in order, no
 * repeats.
 *
 * Exactly the handles the body's rendering links (contract C2), because they
 * come from the same parse: `@sam` in prose, or a hand-written
 * `[@sam](/members/sam)`. Never an email address (`a@bob.com` does not
 * mention @bob), never code, never a link's own words. A regex over the raw
 * text used to say otherwise, and notified people the reader could not see
 * named.
 *
 * Its own module, not `lib/community/format`: that one is imported by sign-in
 * (`normalizeEmail`), and the renderer this needs (marked, sanitize-html)
 * has no business in a sign-in route's cold start.
 */
export function parseMentions(text: string): string[] {
  return richTextMentions(text);
}
