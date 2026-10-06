import { renderRichText, richTextToPlain } from "@/lib/content/rich-text";

/**
 * The original names for the member-text pipeline, kept for their callers.
 *
 * There is one renderer, `lib/content/rich-text.ts` (contract C2), and these
 * delegate to it, so a lesson body, a lesson discussion, an event post and a
 * Kitchen Table post all render and excerpt identically: raw HTML shown as
 * typed rather than interpreted, links and images checked, mentions linked,
 * and plain text with no markdown left in it. New code should import from
 * `@/lib/content/rich-text` directly.
 *
 * `linkMentions` (a regex over the markdown source) is gone: mentions are now
 * linked in the parsed text, which is what keeps them out of code, out of
 * link text and out of email addresses.
 */

/** Sanitized HTML from markdown. See `renderRichText`. */
export function renderMarkdown(source: string): string {
  return renderRichText(source);
}

/** Text with no markup at all, on one line. See `richTextToPlain`. */
export function toPlainText(source: string): string {
  return richTextToPlain(source);
}
