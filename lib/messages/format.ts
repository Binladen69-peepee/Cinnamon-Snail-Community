export type LinkPart = { text: string; href?: string };

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;

/**
 * Splits message text into plain and linkable parts. Only http(s) is linked, so
 * a pasted `javascript:` string stays inert text.
 */
export function autoLink(body: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ text: body.slice(lastIndex, start) });
    }
    // Trailing punctuation usually belongs to the sentence, not the URL.
    const raw = match[0].replace(/[.,;:!?)\]]+$/, "");
    parts.push({ text: raw, href: raw });
    lastIndex = start + raw.length;
  }
  if (lastIndex < body.length) {
    parts.push({ text: body.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ text: body }];
}
