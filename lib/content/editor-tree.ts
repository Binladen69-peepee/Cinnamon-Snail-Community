import sanitizeHtml from "sanitize-html";

/**
 * A small, strict reading of HTML for the writing surface.
 *
 * Three kinds of HTML reach the editor: its own DOM (to save it as markdown),
 * the rendered markdown of a post being edited (to show it formatted), and
 * whatever someone pastes or drops. All three are read the same way:
 *
 * 1. **sanitize-html parses it** against an allowlist of the structure the
 *    editor understands. Every other element is dropped and its text kept;
 *    `<script>`, `<style>`, `<svg>` and their kin are dropped with their text.
 *    Attributes are reduced to `href`/`title` on links, `src`/`alt`/`title` on
 *    images, and `style` on the few inline elements whose bold or italic can
 *    live in a style (a pasted Google Doc). No class, no event handler, no
 *    other style ever reaches a node.
 * 2. **The sanitizer's own output is tokenized into a tree.** That output is
 *    regular — every `<` in text is escaped, every attribute is double-quoted
 *    — so the tokenizer here only has to understand HTML that sanitize-html
 *    wrote, not HTML in general.
 *
 * Pure and environment-free: the same tree comes out in the browser and in a
 * test, which is what lets the editor's serializer be tested without a DOM.
 */

export type EditorText = { type: "text"; text: string };
export type EditorElement = {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: EditorNode[];
};
export type EditorNode = EditorText | EditorElement;

/** Elements that end a line: everything else is inline. */
export const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p",
  "div",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "ul",
  "ol",
  "li",
  "pre",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

const VOID_TAGS: ReadonlySet<string> = new Set(["br", "img", "hr"]);

/** Spellings folded into the one tag the serializer knows. */
const RENAMED: Record<string, string> = {
  b: "strong",
  i: "em",
  cite: "em",
  dfn: "em",
  s: "del",
  strike: "del",
  kbd: "code",
  samp: "code",
  tt: "code",
  h1: "h2",
  h5: "h4",
  h6: "h4",
  tfoot: "tbody",
  caption: "div",
  // Sectioning and other block containers: they still end a line.
  address: "div",
  article: "div",
  aside: "div",
  center: "div",
  dd: "div",
  details: "div",
  dl: "div",
  dt: "div",
  fieldset: "div",
  figcaption: "div",
  figure: "div",
  footer: "div",
  header: "div",
  hgroup: "div",
  legend: "div",
  main: "div",
  nav: "div",
  section: "div",
  summary: "div",
};

const ALLOWED_TAGS = [
  "p",
  "div",
  "br",
  "span",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "a",
  "img",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h2",
  "h3",
  "h4",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

/** Elements whose text is not prose: dropped whole, never shown as words. */
const DROPPED_WITH_TEXT = [
  "script",
  "style",
  "textarea",
  "option",
  "select",
  "xmp",
  "noscript",
  "noembed",
  "noframes",
  "template",
  "title",
  "head",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "canvas",
  "audio",
  "video",
  "picture",
  "map",
  "button",
];

const READ: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title"],
    ol: ["start"],
    th: ["align"],
    td: ["align"],
    span: ["style"],
    strong: ["style"],
    em: ["style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["https"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: DROPPED_WITH_TEXT,
  transformTags: Object.fromEntries(
    Object.entries(RENAMED).map(([from, to]) => [from, sanitizeHtml.simpleTransform(to, {})]),
  ),
  // Style values are read here only for bold and italic, never written back
  // out. Parsing them would pull postcss into the browser for nothing.
  parseStyleAttributes: false,
  // Content outside `<html>…</html>` (a clipboard's preamble) is not content.
  enforceHtmlBoundary: true,
  // Deeper than anyone nests on purpose; bounds the recursion below it.
  nestingLimit: 48,
};

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "�";
      if (code >= 0xd800 && code <= 0xdfff) return "�";
      return String.fromCodePoint(code);
    }
    return NAMED[entity.toLowerCase()] ?? match;
  });
}

const TAG = /<(\/?)([a-z][a-z0-9]*)((?:\s+[a-z][a-z0-9-]*(?:="[^"]*")?)*)\s*\/?>/y;
const ATTRIBUTE = /\s+([a-z][a-z0-9-]*)(?:="([^"]*)")?/g;

/** Tokenizes sanitize-html's output into a tree. */
function build(html: string): EditorNode[] {
  const root: EditorElement = { type: "element", tag: "#root", attrs: {}, children: [] };
  const stack: EditorElement[] = [root];
  let text = "";

  const flush = () => {
    if (!text) return;
    const parent = stack[stack.length - 1]!;
    const value = decode(text);
    const last = parent.children[parent.children.length - 1];
    if (last?.type === "text") last.text += value;
    else parent.children.push({ type: "text", text: value });
    text = "";
  };

  let index = 0;
  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt === -1) {
      text += html.slice(index);
      break;
    }
    text += html.slice(index, lt);
    TAG.lastIndex = lt;
    const match = TAG.exec(html);
    if (!match) {
      // Not something sanitize-html writes; keep it as the character it is.
      text += "<";
      index = lt + 1;
      continue;
    }
    flush();
    index = TAG.lastIndex;
    const closing = match[1] === "/";
    const tag = match[2]!;
    if (closing) {
      const at = stack.map((element) => element.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const attribute of (match[3] ?? "").matchAll(ATTRIBUTE)) {
      attrs[attribute[1]!] = decode(attribute[2] ?? "");
    }
    const element: EditorElement = { type: "element", tag, attrs, children: [] };
    stack[stack.length - 1]!.children.push(element);
    if (!VOID_TAGS.has(tag)) stack.push(element);
  }
  flush();
  return root.children;
}

/**
 * Any HTML, read down to the structure the editor understands.
 *
 * Safe for hostile input: what comes back holds only allowlisted elements,
 * text, and the handful of attributes named above.
 */
export function parseRichHtml(html: string | null | undefined): EditorNode[] {
  if (!html) return [];
  return build(sanitizeHtml(String(html), READ));
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/** The attributes each element may be written with; nothing else is. */
const WRITTEN_ATTRIBUTES: Record<string, readonly string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "title"],
  ol: ["start"],
  th: ["align"],
  td: ["align"],
};

export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

/** A tree back to HTML. Only allowlisted tags and attributes are written. */
export function writeHtml(nodes: readonly EditorNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      out += escapeHtmlText(node.text);
      continue;
    }
    if (!ALLOWED_TAGS.includes(node.tag)) {
      out += writeHtml(node.children);
      continue;
    }
    let attrs = "";
    for (const name of WRITTEN_ATTRIBUTES[node.tag] ?? []) {
      const value = node.attrs[name];
      if (value !== undefined && (value !== "" || name === "alt")) {
        attrs += ` ${name}="${escapeAttribute(value)}"`;
      }
    }
    if (VOID_TAGS.has(node.tag)) {
      out += `<${node.tag}${attrs}>`;
      continue;
    }
    out += `<${node.tag}${attrs}>${writeHtml(node.children)}</${node.tag}>`;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Inline formatting carried in a style                                        */
/* -------------------------------------------------------------------------- */

export type StyleMarks = { bold?: boolean; italic?: boolean; strike?: boolean };

function declaration(style: string, property: string): string | undefined {
  const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i");
  return pattern.exec(style)?.[1]?.trim().toLowerCase();
}

/**
 * Bold, italic and strikethrough written as a style rather than an element.
 *
 * A Google Doc marks bold as `font-weight:700` on a span and wraps the whole
 * paste in `<b style="font-weight:normal">`, so a style can switch formatting
 * off as well as on: `false` means off, `undefined` means the style says
 * nothing about it.
 */
export function styleMarks(style: string | null | undefined): StyleMarks {
  if (!style) return {};
  const marks: StyleMarks = {};
  const weight = declaration(style, "font-weight");
  if (weight) {
    const numeric = Number.parseInt(weight, 10);
    marks.bold = weight === "bold" || weight === "bolder" || (Number.isFinite(numeric) && numeric >= 600);
  }
  const fontStyle = declaration(style, "font-style");
  if (fontStyle) marks.italic = /italic|oblique/.test(fontStyle);
  const decoration = declaration(style, "text-decoration-line") ?? declaration(style, "text-decoration");
  if (decoration) marks.strike = /line-through/.test(decoration);
  return marks;
}

/** Concatenated text of a subtree, line breaks as newlines. */
export function textOf(nodes: readonly EditorNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += node.text;
    else if (node.tag === "br") out += "\n";
    else out += textOf(node.children);
  }
  return out;
}
