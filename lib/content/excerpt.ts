/**
 * A short, clean preview of plain text: one line, cut on a word, never in the
 * middle of an emoji.
 *
 * `text.slice(0, 90)` was the old excerpt, and it had two faults: it cut words
 * in half, and because JavaScript strings are UTF-16 it could cut an emoji in
 * half too, leaving a lone surrogate that renders as a broken-glyph box in a
 * notification. Pass text that is already plain (`richTextToPlain`).
 */
export function excerptText(text: string | null | undefined, max: number): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (max <= 0) return "";
  if (clean.length <= max) return clean;

  let cut = clean.slice(0, Math.max(1, max - 1));
  // A high surrogate on the end means the cut split a pair.
  if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1);
  // Prefer a word boundary, unless that would throw most of the text away.
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(max * 0.6)) cut = cut.slice(0, space);
  cut = cut.replace(/[\s.,;:!?·\u2013\u2014-]+$/u, "");
  return `${cut}…`;
}
