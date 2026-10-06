import { styleMarks } from "@/lib/content/editor-tree";
import { safeLinkHref } from "@/lib/content/urls";

/**
 * The composer's small decisions, as pure functions so they can be tested
 * without a browser: what is being typed after an `@`, what a typed link
 * address means, which toolbar buttons are pressed, where arrow keys move
 * focus in the toolbar.
 */

/**
 * The handle being typed just before the caret: `@` at the start of the line
 * or after a space, then up to 32 handle characters. `length` counts the `@`.
 */
export function mentionQuery(before: string): { query: string; length: number } | null {
  const match = /(?:^|\s)@([a-z0-9_]{0,32})$/i.exec(before);
  if (!match) return null;
  const query = match[1] ?? "";
  return { query, length: query.length + 1 };
}

/**
 * What someone typed into the link field, as a link the renderer will keep,
 * or null. `example.com/x` means https; `name@example.com` means an email.
 * Anything the post would refuse (`javascript:`, `data:`) is refused here.
 */
export function linkFromInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (
    /^(?:https?:|mailto:)/i.test(value) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    value.startsWith("/") ||
    value.startsWith("#")
  ) {
    return safeLinkHref(value);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[^:/]+:\d/.test(value)) {
    // Some other scheme (`javascript:`, `data:`): never a link.
    return null;
  }
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value)) return safeLinkHref(`mailto:${value}`);
  if (/\s/.test(value) || !/\./.test(value)) return null;
  return safeLinkHref(`https://${value}`);
}

export type FormatState = {
  bold: boolean;
  italic: boolean;
  link: boolean;
  bulleted: boolean;
  numbered: boolean;
  heading: boolean;
  quote: boolean;
};

export const NO_FORMAT: FormatState = Object.freeze({
  bold: false,
  italic: false,
  link: false,
  bulleted: false,
  numbered: false,
  heading: false,
  quote: false,
});

/**
 * Which formatting the caret sits in, from the elements around it, innermost
 * first. Read the way the serializer reads them, so a pressed Bold always
 * means the text will be saved bold.
 */
export function formatState(chain: readonly { tag: string; style?: string | null; href?: string | null }[]): FormatState {
  const state: FormatState = { ...NO_FORMAT };
  let list: "ul" | "ol" | null = null;
  // Outermost first, so an inner element can switch formatting back off.
  for (const element of [...chain].reverse()) {
    const tag = element.tag.toLowerCase();
    if (tag === "strong" || tag === "b") state.bold = true;
    if (tag === "em" || tag === "i" || tag === "cite" || tag === "dfn") state.italic = true;
    if (tag === "span" || tag === "strong" || tag === "b" || tag === "em" || tag === "i") {
      const marks = styleMarks(element.style);
      if (marks.bold !== undefined) state.bold = marks.bold;
      if (marks.italic !== undefined) state.italic = marks.italic;
    }
    if (tag === "a" && element.href && safeLinkHref(element.href)) state.link = true;
    if (tag === "ul" || tag === "ol") list = tag;
    if (/^h[1-6]$/.test(tag)) state.heading = true;
    if (tag === "blockquote") state.quote = true;
  }
  state.bulleted = list === "ul";
  state.numbered = list === "ol";
  return state;
}

export function sameFormat(a: FormatState, b: FormatState): boolean {
  return (Object.keys(a) as (keyof FormatState)[]).every((key) => a[key] === b[key]);
}

/**
 * Arrow-key movement in a toolbar (one tab stop, arrows between buttons):
 * the next enabled button in that direction, wrapping, or null for a key
 * that does not move.
 */
export function nextToolIndex(current: number, key: string, enabled: readonly boolean[]): number | null {
  const count = enabled.length;
  if (!count || !enabled.some(Boolean)) return null;
  const find = (from: number, step: number) => {
    for (let offset = 0; offset < count; offset += 1) {
      const index = (((from + step * offset) % count) + count) % count;
      if (enabled[index]) return index;
    }
    return null;
  };
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return find(current + 1, 1);
    case "ArrowLeft":
    case "ArrowUp":
      return find(current - 1, -1);
    case "Home":
      return find(0, 1);
    case "End":
      return find(count - 1, -1);
    default:
      return null;
  }
}

/** How many more characters of markdown fit, never negative. */
export function roomLeft(current: number, maxLength: number | undefined): number {
  if (!maxLength) return Number.POSITIVE_INFINITY;
  return Math.max(0, maxLength - current);
}
