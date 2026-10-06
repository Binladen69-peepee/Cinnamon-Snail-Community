import {
  Marked,
  Renderer,
  type RendererExtension,
  type Token,
  type TokenizerExtension,
  type Tokens,
} from "marked";
import sanitizeHtml from "sanitize-html";
import {
  decodeEntities,
  isInternalHref,
  safeImageSrc,
  safeLinkHref,
} from "@/lib/content/urls";
import { isAnimatedMedia } from "@/lib/uploads/policy";

/**
 * The one pipeline for member-written text: posts, comments, ideas, bulletin
 * descriptions (DEC-078, contract C2).
 *
 * CONTRACT (other modules import these names; keep the signatures):
 * - `renderRichText(body)` → sanitized HTML for display. Markdown in, safe
 *   HTML out. Raw HTML typed by a member is never passed through.
 * - `richTextToPlain(body)` → the same text with no markup at all, for card
 *   excerpts, notifications, emails and search. Never contains `**`.
 *
 * How it stays safe, in order:
 *
 * 1. **Raw HTML is text.** Markdown allows inline HTML; member posts do not.
 *    Every HTML token marked finds (`<script>`, `<img onerror=…>`, a pasted
 *    `<div>`) is escaped and shown exactly as it was typed, so nothing a
 *    member writes is ever interpreted as markup, and nothing they wrote
 *    silently disappears either.
 * 2. **Every URL is checked where it is written.** Links keep only `http:`,
 *    `https:`, `mailto:` and same-site paths, after decoding the character
 *    references a browser would decode (`&#106;avascript:`). External links
 *    open in a new tab with `rel="noopener noreferrer nofollow ugc"`. Inline
 *    images load only from our own media route and a short list of https
 *    hosts (`lib/content/urls.ts`); any other image becomes a link to it.
 * 3. **sanitize-html runs last anyway**, with an allowlist of exactly the tags
 *    and attributes the renderer emits. If a future renderer change ever lets
 *    something through, this is the net under it.
 *
 * How it stays faithful to what was typed:
 *
 * - **Line breaks are kept.** A member pressing Enter in the composer means a
 *   new line, and a post that ran their lines together was the post not
 *   looking like what they wrote. (Done in the `text` renderer, not with
 *   marked's `breaks` option, whose scan is quadratic in a run of spaces.)
 * - **Bold is forgiving.** CommonMark refuses `**word **` and `**Note:**text`
 *   (the markers must hug the text, and punctuation changes the rules), and
 *   both are what people — and the old toolbar — actually produce. Those
 *   showed members literal asterisks. A `**…**` pair on one line with no other
 *   asterisk inside is bold here, with any inner spacing moved outside.
 * - **@mentions are linked in the parsed text**, never in code, never inside
 *   a link or an image, never in an email address.
 *
 * Deterministic and environment-free, so the server and the browser render
 * the same bytes and a page hydrates cleanly. Never throws: a failure renders
 * the text escaped, as typed. Bounded: input built to make a markdown parser
 * slow (floods of delimiters, thousands of nested quotes) is shown as typed
 * instead of parsed, so no post can cost its readers more than a few
 * milliseconds to render.
 */

export const EXTERNAL_LINK_REL = "noopener noreferrer nofollow ugc";

export type RichTextAnalysis = {
  /** Sanitized HTML. */
  readonly html: string;
  /** No markup at all, whitespace collapsed to single spaces. */
  readonly plain: string;
  /** Lowercased handles linked in the text, first mention first, no repeats. */
  readonly mentions: readonly string[];
};

const EMPTY: RichTextAnalysis = Object.freeze({
  html: "",
  plain: "",
  mentions: Object.freeze([]) as readonly string[],
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* -------------------------------------------------------------------------- */
/* Forgiving emphasis                                                          */
/* -------------------------------------------------------------------------- */

function isBlank(char: string | undefined): boolean {
  return char === " " || char === "\t";
}

/** Leading and trailing spaces/tabs of a string, counted without a regex. */
function spacing(value: string): { lead: number; trail: number } {
  let lead = 0;
  while (lead < value.length && isBlank(value[lead])) lead += 1;
  let trail = 0;
  while (trail < value.length - lead && isBlank(value[value.length - 1 - trail])) trail += 1;
  return { lead, trail };
}

/**
 * `**…**` on one line, with no other `*` or backtick inside.
 *
 * A hand-written scan rather than a regex: overlapping quantifiers over
 * spaces backtrack quadratically, and a 20,000-character line of spaces is an
 * easy thing for someone to paste. This is linear in the line.
 */
export function scanLenientStrong(
  src: string,
): { raw: string; lead: string; inner: string; trail: string } | null {
  if (!src.startsWith("**") || src[2] === "*") return null;
  let close = -1;
  for (let i = 2; i < src.length; i += 1) {
    const char = src[i];
    if (char === "\n" || char === "`") return null;
    if (char === "*") {
      if (src[i + 1] === "*" && src[i + 2] !== "*") close = i;
      break;
    }
  }
  if (close === -1) return null;
  const body = src.slice(2, close);
  const { lead, trail } = spacing(body);
  const inner = body.slice(lead, body.length - trail);
  if (!inner || /\s/.test(inner[0]!) || /\s/.test(inner[inner.length - 1]!)) return null;
  return {
    raw: src.slice(0, close + 2),
    lead: body.slice(0, lead),
    inner,
    trail: body.slice(body.length - trail),
  };
}

/**
 * `_text _`: italic with a space before the closing underscore.
 *
 * The old toolbar wrapped a selection's trailing space inside the markers,
 * which CommonMark then refused, so posts written with it show `_word _next`.
 * Only that shape is accepted — the inner space is what marks it, so ordinary
 * underscores (`snake_case`, `_proper_`) are left to the standard rules — and
 * never inside a word (the tokenizer checks what came before).
 */
export function scanLenientEmphasis(
  src: string,
): { raw: string; inner: string; trail: string } | null {
  if (src[0] !== "_" || src[1] === undefined || src[1] === "_" || isBlank(src[1])) return null;
  let close = -1;
  for (let i = 1; i < src.length; i += 1) {
    const char = src[i];
    if (char === "\n" || char === "`") return null;
    if (char === "_") {
      close = i;
      break;
    }
  }
  if (close === -1 || src[close + 1] === "_") return null;
  const body = src.slice(1, close);
  const { trail } = spacing(body);
  if (trail === 0) return null;
  const inner = body.slice(0, body.length - trail);
  if (!inner || /\s/.test(inner[inner.length - 1]!)) return null;
  return { raw: src.slice(0, close + 1), inner, trail: body.slice(body.length - trail) };
}

/*
 * Neither extension declares `start`. marked's own text scanner already stops
 * before every `*` and `_`, so these tokenizers are offered each of those
 * positions anyway — and a `start` hook is an `indexOf` over the rest of the
 * paragraph on every text token, which made a long line quadratic.
 */
const lenientStrong: TokenizerExtension & RendererExtension = {
  name: "lenientStrong",
  level: "inline",
  tokenizer(src) {
    const found = scanLenientStrong(src);
    if (!found) return undefined;
    return {
      type: "lenientStrong",
      raw: found.raw,
      text: found.inner,
      lead: found.lead,
      trail: found.trail,
      tokens: this.lexer.inlineTokens(found.inner),
    };
  },
  renderer(token) {
    const inner = this.parser.parseInline(token.tokens ?? []);
    return `${token.lead ?? ""}<strong>${inner}</strong>${token.trail ?? ""}`;
  },
  childTokens: ["tokens"],
};

const lenientEmphasis: TokenizerExtension & RendererExtension = {
  name: "lenientEmphasis",
  level: "inline",
  tokenizer(src, tokens) {
    // Intraword underscores are never emphasis: look at what came before.
    const before = tokens[tokens.length - 1]?.raw.slice(-1);
    if (before && /[\p{L}\p{N}_]/u.test(before)) return undefined;
    const found = scanLenientEmphasis(src);
    if (!found) return undefined;
    return {
      type: "lenientEmphasis",
      raw: found.raw,
      text: found.inner,
      trail: found.trail,
      tokens: this.lexer.inlineTokens(found.inner),
    };
  },
  renderer(token) {
    return `<em>${this.parser.parseInline(token.tokens ?? [])}</em>${token.trail ?? ""}`;
  },
  childTokens: ["tokens"],
};

/* -------------------------------------------------------------------------- */
/* Renderer                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Wide tables scroll inside themselves instead of widening the card past a
 * phone screen. Inline, because stored HTML is rendered in places that do not
 * share a stylesheet rule for it.
 */
const TABLE_STYLE = "display:block;max-width:100%;overflow-x:auto";

function anchor(href: string, title: string | null | undefined, inner: string): string {
  const titleAttr = title ? ` title="${escapeHtml(decodeEntities(title))}"` : "";
  if (isInternalHref(href)) {
    return `<a href="${escapeHtml(href)}"${titleAttr}>${inner}</a>`;
  }
  return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="${EXTERNAL_LINK_REL}">${inner}</a>`;
}

const markdown = new Marked({
  gfm: true,
  // Not `breaks: true`, which is what marked offers for this: its line-break
  // scan is quadratic in a run of spaces (30,000 spaces took over a second),
  // and every card renders its body on every view. The `text` renderer below
  // turns the same soft line breaks into `<br>` in linear time.
  breaks: false,
  async: false,
  extensions: [lenientStrong, lenientEmphasis],
  renderer: {
    /**
     * A new line in the composer is a new line in the post. Code and raw HTML
     * are other token types, so only prose is affected.
     */
    text(token) {
      const html = Renderer.prototype.text.call(this, token);
      return "tokens" in token && token.tokens ? html : html.replace(/\n/g, "<br>");
    },
    /** Raw HTML is shown as typed, never interpreted. */
    html({ text, block }) {
      const escaped = escapeHtml(text);
      if (!block) return escaped;
      const lines = escaped.replace(/\n+$/, "").replace(/\n/g, "<br>");
      return lines ? `<p>${lines}</p>\n` : "";
    },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      const safe = safeLinkHref(href);
      // A link that may not be followed keeps its words and loses its target.
      return safe ? anchor(safe, title, inner) : inner;
    },
    image({ href, title, text, tokens }) {
      const typed = tokens?.length
        ? this.parser.parseInline(tokens, this.parser.textRenderer)
        : text;
      const alt = decodeEntities(typed).replace(/\s+/g, " ").trim().slice(0, 300);
      const src = safeImageSrc(href);
      if (src) {
        // An image with no description still says what it is, to a screen
        // reader and in the post's plain text.
        const label = alt || (isAnimatedMedia({ url: src }) ? "GIF" : "Image");
        const titleAttr = title ? ` title="${escapeHtml(decodeEntities(title))}"` : "";
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(label)}"${titleAttr} loading="lazy" decoding="async">`;
      }
      // Not a host we show inline: a link to it, so nothing silently vanishes.
      const link = safeLinkHref(href);
      const label = escapeHtml(alt || link || "");
      return link ? anchor(link, null, label) : label;
    },
    /** A post has one title already; headings inside it start a level down. */
    heading({ tokens, depth }) {
      const level = Math.min(Math.max(depth, 2), 4);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
    /** A task list's box, as a character: a disabled input is not content. */
    checkbox({ checked }) {
      return checked ? "\u2611 " : "\u2610 ";
    },
    table(token) {
      const html = Renderer.prototype.table.call(this, token);
      return html.replace("<table>", `<table style="${TABLE_STYLE}">`);
    },
  },
});

/* -------------------------------------------------------------------------- */
/* Mentions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `@handle` after a boundary. The character before decides it: an email's
 * local part is a word, a link path is a slash, a code sample is a backtick.
 */
const MENTION = /(^|[^\p{L}\p{N}_`\]\/\[@])@([a-z0-9_]{2,32})(?![a-z0-9_])/giu;

/** A link written by hand to a member, `[@sam](/members/sam)`. */
const MEMBER_PATH = /^\/members\/([a-z0-9_]{2,32})\/?$/i;

/** Tokens whose text is not prose: their contents are never mentions. */
const OPAQUE = new Set([
  "image",
  "codespan",
  "code",
  "html",
  "escape",
  "checkbox",
  "br",
  "hr",
  "space",
  "def",
]);

function textToken(text: string, escaped: boolean): Tokens.Text {
  return { type: "text", raw: text, text, escaped };
}

function mentionToken(typed: string, handle: string): Tokens.Link {
  const label = `@${typed}`;
  return {
    type: "link",
    raw: label,
    href: `/members/${handle}`,
    title: null,
    text: label,
    tokens: [textToken(label, false)],
  };
}

/**
 * Mentions linked in one body. A real post names a handful of people; past
 * this the rest stay as text, which bounds the work a pasted wall of handles
 * can cost every reader (notifications stop at twenty regardless).
 */
const MAX_LINKED_MENTIONS = 50;

function splitMentions(token: Tokens.Text, found: string[]): Token[] {
  const text = token.text;
  if (!text.includes("@") || found.length >= MAX_LINKED_MENTIONS) return [token];
  const out: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    if (found.length >= MAX_LINKED_MENTIONS) break;
    const prefix = match[1] ?? "";
    const typed = match[2]!;
    const at = (match.index ?? 0) + prefix.length;
    if (at > last) out.push(textToken(text.slice(last, at), Boolean(token.escaped)));
    const handle = typed.toLowerCase();
    found.push(handle);
    out.push(mentionToken(typed, handle));
    last = at + 1 + typed.length;
  }
  if (last === 0) return [token];
  if (last < text.length) out.push(textToken(text.slice(last), Boolean(token.escaped)));
  return out;
}

/**
 * Links every `@handle` in prose, in place, and collects the handles.
 *
 * Walks the parsed tokens rather than the source, which is what makes the
 * exclusions exact: code is a `codespan`, a link's words are its children
 * (skipped, so a handle inside link text never becomes a link in a link), an
 * email address is already an autolink.
 */
function linkMentions(tokens: Token[], found: string[]): Token[] {
  const out: Token[] = [];
  for (const token of tokens) {
    const generic = token as Tokens.Generic;
    if (token.type === "text" && !Array.isArray(generic.tokens)) {
      out.push(...splitMentions(token as Tokens.Text, found));
      continue;
    }
    if (token.type === "link") {
      const link = token as Tokens.Link;
      const member = MEMBER_PATH.exec(link.href ?? "");
      if (member && link.text.trim().toLowerCase() === `@${member[1]!.toLowerCase()}`) {
        found.push(member[1]!.toLowerCase());
      }
      out.push(token);
      continue;
    }
    if (OPAQUE.has(token.type)) {
      out.push(token);
      continue;
    }
    if (token.type === "list") {
      for (const item of (token as Tokens.List).items) {
        item.tokens = linkMentions(item.tokens, found);
      }
    } else if (token.type === "table") {
      const table = token as Tokens.Table;
      for (const cell of table.header) cell.tokens = linkMentions(cell.tokens, found);
      for (const row of table.rows) {
        for (const cell of row) cell.tokens = linkMentions(cell.tokens, found);
      }
    } else if (Array.isArray(generic.tokens)) {
      generic.tokens = linkMentions(generic.tokens, found);
    }
    out.push(token);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Sanitizing                                                                  */
/* -------------------------------------------------------------------------- */

/** Rebuilds an anchor from its href alone, so no other attribute rides along. */
function transformAnchor(_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const href = safeLinkHref(attribs.href);
  // Not an allowed tag: discarded, and its text kept.
  if (!href) return { tagName: "span", attribs: {} };
  const out: sanitizeHtml.Attributes = { href };
  if (attribs.title) out.title = attribs.title;
  if (!isInternalHref(href)) {
    out.target = "_blank";
    out.rel = EXTERNAL_LINK_REL;
  }
  return { tagName: "a", attribs: out };
}

function transformImage(_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const src = safeImageSrc(attribs.src);
  if (!src) return { tagName: "span", attribs: {} };
  const out: sanitizeHtml.Attributes = {
    src,
    alt: attribs.alt ?? "",
    loading: "lazy",
    decoding: "async",
  };
  if (attribs.title) out.title = attribs.title;
  return { tagName: "img", attribs: out };
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "b",
    "i",
    "del",
    "s",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "h2",
    "h3",
    "h4",
    "code",
    "pre",
    "img",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "loading", "decoding"],
    ol: ["start"],
    th: ["align"],
    td: ["align"],
    table: ["style"],
  },
  allowedStyles: {
    table: {
      display: [/^block$/],
      "max-width": [/^100%$/],
      "overflow-x": [/^auto$/],
    },
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["https"] },
  allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: { a: transformAnchor, img: transformImage },
};

/* -------------------------------------------------------------------------- */
/* Plain text                                                                  */
/* -------------------------------------------------------------------------- */

/** Block ends become spaces, so "one</p><p>two" reads "one two", not "onetwo". */
const BLOCK_END =
  /<\/(?:p|li|h[1-6]|blockquote|pre|tr|th|td|table|thead|tbody|ul|ol)>/gi;

/**
 * The rendered HTML as text: exactly the words a reader sees.
 *
 * Derived from the render, not the source, so it cannot disagree with the
 * post: no `**`, no `![](…)`, no `[text](url)`. An image contributes its
 * description. The regexes here only ever see this module's own output.
 */
function htmlToPlain(html: string): string {
  const spaced = html
    .replace(/<img\b[^>]*>/gi, (tag) => ` ${/\balt="([^"]*)"/i.exec(tag)?.[1] ?? ""} `)
    .replace(/<(?:br|hr)\b[^>]*>/gi, " ")
    .replace(BLOCK_END, "$& ");
  // sanitize-html with no allowed tags is a real HTML parser: it drops every
  // tag and decodes every character reference, then re-escapes `& < >`.
  const text = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return finishPlain(text);
}

/**
 * Last pass over plain text.
 *
 * Tag-shaped text a member typed (shown escaped in the post) is markup all the
 * same, and plain text has none — which also means a careless consumer that
 * pours this into `innerHTML` cannot create an element from it. Stray `**`
 * that never became bold is dropped for the same reason: plain text never
 * carries a formatting marker.
 */
function finishPlain(text: string): string {
  return text
    .replace(/<[A-Za-z!/?][^<>]*>/g, " ")
    .replace(/<(?=[A-Za-z!/?])/g, "< ")
    .replace(/\*{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* The pipeline                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Rendered results, by source.
 *
 * Cards render every body (and excerpt it) on each request and again in the
 * browser, and the same few bodies come round constantly. The output is a
 * pure function of the input — nothing about the viewer — so a small,
 * bounded, per-process cache is safe to share. Long bodies are not kept.
 */
const CACHE_LIMIT = 400;
const CACHEABLE_LENGTH = 8000;
const cache = new Map<string, RichTextAnalysis>();

function remember(source: string, analysis: RichTextAnalysis): RichTextAnalysis {
  if (source.length > CACHEABLE_LENGTH) return analysis;
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(source, analysis);
  return analysis;
}

/**
 * Quotes nest at most this deep. marked parses `>>>>…` recursively and runs
 * out of stack at a few thousand levels; nobody quotes a quote eight times.
 */
const MAX_QUOTE_DEPTH = 8;
const QUOTE_RUN = new RegExp(`^([ \\t]*(?:>[ \\t]?){${MAX_QUOTE_DEPTH}})(?:>[ \\t]?)+`, "gm");

function normalizeSource(body: unknown): string {
  return String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "\uFFFD")
    .replace(QUOTE_RUN, "$1");
}

/**
 * When a body is parsed as markdown at all.
 *
 * marked is fast on prose and slow on floods of delimiters: twenty thousand
 * characters of `a*a*a*…` or `[a](` take it half a second, and a card renders
 * its body on every view, on the server and again in the browser. Posts and
 * comments are capped well below the point where that matters, but this
 * module serves every caller, so the bound lives here: past these limits the
 * text is shown as typed — escaped, with its paragraphs and line breaks — in
 * linear time. No real post comes near either number.
 */
const MAX_MARKDOWN_LENGTH = 30_000;
const MAX_MARKUP_CHARACTERS = 4_000;

function tooComplexForMarkdown(source: string): boolean {
  if (source.length > MAX_MARKDOWN_LENGTH) return true;
  let markup = 0;
  for (let i = 0; i < source.length; i += 1) {
    switch (source.charCodeAt(i)) {
      case 42: // *
      case 95: // _
      case 91: // [
      case 60: // <
      case 96: // `
      case 126: // ~
        markup += 1;
        if (markup > MAX_MARKUP_CHARACTERS) return true;
        break;
      default:
        break;
    }
  }
  return false;
}

/** The text as typed, escaped, with its paragraphs and line breaks. */
function renderAsTyped(source: string): string {
  return source
    .trim()
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function unique(values: string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

/**
 * Everything the write paths need from a body, in one parse: the HTML to
 * store, the plain text to store and index, and who was mentioned.
 */
export function analyzeRichText(body: string | null | undefined): RichTextAnalysis {
  const source = normalizeSource(body);
  if (!source.trim()) return EMPTY;

  const hit = cache.get(source);
  if (hit) {
    // Most recently used goes to the back, so the oldest is evicted first.
    cache.delete(source);
    cache.set(source, hit);
    return hit;
  }

  let analysis: RichTextAnalysis;
  try {
    if (tooComplexForMarkdown(source)) {
      const html = renderAsTyped(source);
      analysis = Object.freeze({ html, plain: htmlToPlain(html), mentions: unique([]) });
    } else {
      const tokens = markdown.lexer(source);
      const mentions: string[] = [];
      const linked = linkMentions(tokens, mentions);
      // In place, so the list keeps its reference-link table.
      tokens.splice(0, tokens.length, ...linked);
      const html = sanitizeHtml(markdown.parser(tokens), SANITIZE).trim();
      analysis = Object.freeze({ html, plain: htmlToPlain(html), mentions: unique(mentions) });
    }
  } catch {
    // The renderer should never throw; if it does, the words still show.
    const html = renderAsTyped(source);
    analysis = Object.freeze({ html, plain: finishPlain(source), mentions: unique([]) });
  }
  return remember(source, analysis);
}

/** Sanitized HTML for a member-written body. Raw HTML is never passed through. */
export function renderRichText(body: string | null | undefined): string {
  return analyzeRichText(body).html;
}

/** The body as plain text: no markup, no `**`, one line. */
export function richTextToPlain(body: string | null | undefined): string {
  return analyzeRichText(body).plain;
}

/** Handles mentioned in a body, lowercased, in order, without repeats. */
export function richTextMentions(body: string | null | undefined): string[] {
  return [...analyzeRichText(body).mentions];
}

/** Whether a body renders to anything a reader would see. */
export function hasVisibleContent(analysis: RichTextAnalysis): boolean {
  return analysis.plain.length > 0 || /<img\b/i.test(analysis.html);
}
