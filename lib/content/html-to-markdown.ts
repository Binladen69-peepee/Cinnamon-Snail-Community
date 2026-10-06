import {
  BLOCK_TAGS,
  parseRichHtml,
  styleMarks,
  textOf,
  type EditorElement,
  type EditorNode,
} from "@/lib/content/editor-tree";
import { renderRichText } from "@/lib/content/rich-text";
import { safeImageSrc, safeLinkHref } from "@/lib/content/urls";

/**
 * What the composer saves: its HTML, written back as the markdown every post
 * is stored in.
 *
 * The composer shows formatting as formatting (bold is bold, a list is a
 * list), but the stored body stays the markdown `renderRichText` reads, so the
 * server, the feed, notifications and search do not change. This is the one
 * place that crosses back from HTML to markdown, and it is strict about it:
 *
 * - **Only the editor's structure survives.** Bold and italic, strikethrough,
 *   links, line breaks, paragraphs, lists, quotes, headings, code and the
 *   images the GIF picker inserts. Every other element is its text; scripts,
 *   styles and their contents are nothing; no attribute but a checked `href`
 *   or `src` is read. (`lib/content/editor-tree` does the reading.)
 * - **Typed characters stay characters.** A `*`, `_`, `#`, `[`, `<` or `1.`
 *   that someone typed is escaped where markdown would read it as syntax, so
 *   a post shows exactly the text that was in the box. Handles and web
 *   addresses are written so they link the way they did as typed.
 * - **Formatting is written so the renderer reads it.** Markers hug the words
 *   (spaces and, where a reader would refuse it, edge punctuation move
 *   outside), adjacent bold runs are one run, links are written explicitly.
 *
 * And then it checks itself: a paragraph that carries formatting is rendered
 * with `renderRichText` and compared with what the editor held. Where the
 * renderer reads it differently (marked's emphasis rules are its own), it is
 * written again: with edge punctuation moved outside the markers, then with
 * italic written in underscores. Only if none of those render faithfully is
 * the formatting dropped from that paragraph (strikethrough first, then
 * italic, then bold), rather than ever showing a member stray asterisks. The
 * words never change.
 */

type Mark = "strong" | "em" | "del";
const MARKS: readonly Mark[] = ["strong", "em", "del"];
const MARKER: Record<Mark, string> = { strong: "**", em: "*", del: "~~" };

type Link = { id: number; href: string; title: string | null };

type CharAtom = {
  kind: "char";
  ch: string;
  strong: boolean;
  em: boolean;
  del: boolean;
  code: boolean;
  link: Link | null;
};
type ImageAtom = { kind: "image"; src: string; alt: string; title: string | null; link: Link | null };
type BreakAtom = { kind: "br" };
type Atom = CharAtom | ImageAtom | BreakAtom;
type Collected = Atom | { kind: "block" };

type Style = {
  strong: boolean;
  em: boolean;
  del: boolean;
  code: boolean;
  pre: boolean;
  link: Link | null;
};

type Context = {
  /** Link ids, so two adjacent links to the same place stay two links. */
  links: number;
  /** Mentions linked so far; the renderer stops at fifty. */
  mentions: number;
  /** Paragraphs whose formatting had to be reduced to render faithfully. */
  degraded: number;
};

const PLAIN: Style = { strong: false, em: false, del: false, code: false, pre: false, link: null };
const BREAK: BreakAtom = { kind: "br" };
const BLOCK = { kind: "block" } as const;

/* -------------------------------------------------------------------------- */
/* Reading inline content into atoms                                           */
/* -------------------------------------------------------------------------- */

function charAtom(ch: string, style: Style): CharAtom {
  return {
    kind: "char",
    ch,
    strong: style.strong,
    em: style.em,
    del: style.del,
    code: style.code,
    link: style.link,
  };
}

function pushText(text: string, style: Style, out: Collected[]) {
  for (const raw of text.replace(/\r\n?/g, "\n")) {
    // Zero-width spaces are caret scaffolding, not content.
    if (raw === "\u200b" || raw === "\ufeff") continue;
    if (raw === "\n" && style.pre) {
      out.push(BREAK);
      continue;
    }
    out.push(charAtom(/\s/.test(raw) ? " " : raw, style));
  }
}

function imageAlt(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function collect(nodes: readonly EditorNode[], style: Style, out: Collected[], ctx: Context) {
  for (const node of nodes) {
    if (node.type === "text") {
      pushText(node.text, style, out);
      continue;
    }
    const { tag, attrs, children } = node;
    switch (tag) {
      case "br":
        out.push(BREAK);
        break;
      case "img": {
        const src = safeImageSrc(attrs.src);
        if (src) {
          out.push({
            kind: "image",
            src,
            alt: imageAlt(attrs.alt),
            title: attrs.title?.trim() || null,
            link: style.link,
          });
        }
        break;
      }
      case "strong":
      case "em":
      case "del":
      case "span": {
        const next = { ...style };
        if (tag === "strong") next.strong = true;
        if (tag === "em") next.em = true;
        if (tag === "del") next.del = true;
        const fromStyle = styleMarks(attrs.style);
        if (fromStyle.bold !== undefined) next.strong = fromStyle.bold;
        if (fromStyle.italic !== undefined) next.em = fromStyle.italic;
        if (fromStyle.strike !== undefined) next.del = fromStyle.strike;
        collect(children, next, out, ctx);
        break;
      }
      case "code":
        collect(children, { ...style, code: true }, out, ctx);
        break;
      case "a": {
        // A link inside a link keeps the outer one; an unsafe link keeps its words.
        const href = style.link ? null : safeLinkHref(attrs.href);
        const link = href
          ? { id: (ctx.links += 1), href, title: attrs.title?.replace(/\s+/g, " ").trim() || null }
          : null;
        collect(children, link ? { ...style, link } : style, out, ctx);
        break;
      }
      case "pre":
        out.push(BLOCK);
        collect(children, { ...style, pre: true }, out, ctx);
        out.push(BLOCK);
        break;
      default:
        if (BLOCK_TAGS.has(tag)) {
          out.push(BLOCK);
          collect(children, style, out, ctx);
          out.push(BLOCK);
        } else {
          collect(children, style, out, ctx);
        }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Normalizing atoms                                                           */
/* -------------------------------------------------------------------------- */

function isSpace(atom: Atom | undefined): boolean {
  return atom?.kind === "char" && atom.ch === " ";
}

/**
 * Whitespace as a reader sees it: one space between words, none at the start
 * or end of a line, no more than one blank line in a row.
 */
function tidy(input: readonly Atom[], singleLine: boolean): Atom[] {
  const out: Atom[] = [];
  for (const atom of input) {
    if (atom.kind === "br") {
      if (singleLine) {
        if (out.length && !isSpace(out[out.length - 1])) out.push(charAtom(" ", PLAIN));
        continue;
      }
      while (isSpace(out[out.length - 1])) out.pop();
      const last = out[out.length - 1];
      const before = out[out.length - 2];
      if (!last) continue;
      if (last.kind === "br" && before?.kind === "br") continue;
      out.push(atom);
      continue;
    }
    if (isSpace(atom)) {
      const last = out[out.length - 1];
      if (!last || last.kind === "br" || isSpace(last)) continue;
    }
    out.push(atom);
  }
  while (out.length && (isSpace(out[out.length - 1]) || out[out.length - 1]!.kind === "br")) {
    out.pop();
  }
  return out;
}

const URL_CANDIDATE =
  /(?:(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/|www\.)(?:[a-zA-Z0-9-]+\.?)+[^\s<]*|[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/g;
/** marked's own rule for the punctuation a bare URL does not keep at its end. */
const BACKPEDAL = /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
/** The renderer's own rule for a handle in prose. */
const MENTION = /(^|[^\p{L}\p{N}_`\]/[@])@([a-z0-9_]{2,32})(?![a-z0-9_])/giu;
const MAX_MENTIONS = 50;

type Candidate = { start: number; end: number; href: string };

function autolinks(text: string): Candidate[] {
  const found: Candidate[] = [];
  URL_CANDIDATE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_CANDIDATE.exec(text))) {
    let value = match[0];
    const email = !/^(?:[a-z]+:\/\/|www\.)/i.test(value);
    if (!email) {
      let previous: string;
      do {
        previous = value;
        value = BACKPEDAL.exec(value)?.[0] ?? "";
      } while (previous !== value);
    }
    if (!value) continue;
    const href = safeLinkHref(
      email ? `mailto:${value}` : /^www\./i.test(value) ? `http://${value}` : value,
    );
    if (href) found.push({ start: match.index, end: match.index + value.length, href });
    URL_CANDIDATE.lastIndex = match.index + Math.max(1, value.length);
  }
  return found;
}

function mentions(text: string, taken: readonly Candidate[], ctx: Context): Candidate[] {
  const found: Candidate[] = [];
  for (const match of text.matchAll(MENTION)) {
    if (ctx.mentions >= MAX_MENTIONS) break;
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    const end = start + 1 + match[2]!.length;
    if (taken.some((other) => start < other.end && end > other.start)) continue;
    const href = safeLinkHref(`/members/${match[2]!.toLowerCase()}`);
    if (!href) continue;
    ctx.mentions += 1;
    found.push({ start, end, href });
  }
  return found;
}

/**
 * Web addresses, email addresses and @handles typed as text, made links.
 *
 * The renderer would link them anyway; making the link explicit here means
 * nothing typed next to an address can bend where the link ends, and an
 * escaped character can never end up inside one.
 */
function linkify(atoms: Atom[], ctx: Context) {
  let i = 0;
  while (i < atoms.length) {
    const first = atoms[i]!;
    if (first.kind !== "char" || first.code || first.link) {
      i += 1;
      continue;
    }
    let j = i;
    const offsets: number[] = [];
    let text = "";
    while (j < atoms.length) {
      const atom = atoms[j]!;
      if (atom.kind !== "char" || atom.code || atom.link) break;
      offsets.push(text.length);
      text += atom.ch;
      j += 1;
    }
    offsets.push(text.length);
    if (/[@.:]/.test(text)) {
      const urls = autolinks(text);
      const handles = mentions(text, urls, ctx);
      for (const candidate of [...urls, ...handles]) {
        const link: Link = { id: (ctx.links += 1), href: candidate.href, title: null };
        for (let k = i; k < j; k += 1) {
          const offset = offsets[k - i]!;
          if (offset >= candidate.start && offset < candidate.end) (atoms[k] as CharAtom).link = link;
        }
      }
    }
    i = j;
  }
}

type Edge = "space" | "punct" | "other";

/**
 * How a delimiter's neighbour reads to the renderer: space, punctuation (or a
 * symbol), or anything else. Every `~` in text is written escaped, and the
 * renderer reads an escape as punctuation too.
 */
function classify(ch: string): Edge {
  if (/\s/.test(ch)) return "space";
  return /[\p{P}\p{S}]/u.test(ch) ? "punct" : "other";
}

function linkId(atom: Atom | undefined): number {
  return atom && atom.kind !== "br" && atom.link ? atom.link.id : 0;
}

/** What sits just before an opening marker placed before `atoms[index]`. */
function edgeBefore(atoms: readonly Atom[], index: number): Edge {
  const previous = atoms[index - 1];
  if (!previous || previous.kind === "br") return "space";
  if (previous.kind === "image" || previous.code) return "punct";
  if (linkId(previous) !== linkId(atoms[index])) return "punct";
  // marked reads an escaped `*` or `_` before an opener as no punctuation.
  if (previous.ch === "*" || previous.ch === "_") return "other";
  return classify(previous.ch);
}

/** What sits just after a closing marker placed after `atoms[index]`. */
function edgeAfter(atoms: readonly Atom[], index: number): Edge {
  const next = atoms[index + 1];
  if (!next || next.kind === "br") return "space";
  if (next.kind === "image" || next.code) return "punct";
  if (linkId(next) !== linkId(atoms[index])) return "punct";
  return classify(next.ch);
}

function hasMark(atom: Atom | undefined, mark: Mark): atom is CharAtom {
  return atom?.kind === "char" && atom[mark];
}

/**
 * Markers hug the words. Spaces at the edge of a bold run move outside it,
 * and, with `punctuation`, so does edge punctuation where a reader would
 * otherwise refuse the marker (`x*"y"*` is not italic; `x"*y*"` is). Works on
 * a copy.
 */
function hug(input: readonly Atom[], punctuation: boolean): Atom[] {
  const atoms = input.map((atom) => (atom.kind === "char" ? { ...atom } : atom));
  for (const mark of MARKS) {
    let i = 0;
    while (i < atoms.length) {
      if (!hasMark(atoms[i], mark)) {
        i += 1;
        continue;
      }
      let end = i;
      const group = linkId(atoms[i]);
      while (end < atoms.length && hasMark(atoms[end], mark) && linkId(atoms[end]) === group) end += 1;
      let start = i;
      i = end;

      while (start < end) {
        const atom = atoms[start] as CharAtom;
        if (!atom.code && atom.ch === " ") {
          atom[mark] = false;
          start += 1;
          continue;
        }
        const inner = atom.code ? "punct" : classify(atom.ch);
        if (punctuation && inner === "punct" && edgeBefore(atoms, start) === "other") {
          if (atom.code) {
            while (start < end && (atoms[start] as CharAtom).code) {
              (atoms[start] as CharAtom)[mark] = false;
              start += 1;
            }
          } else {
            atom[mark] = false;
            start += 1;
          }
          continue;
        }
        break;
      }
      while (end > start) {
        const atom = atoms[end - 1] as CharAtom;
        if (!atom.code && atom.ch === " ") {
          atom[mark] = false;
          end -= 1;
          continue;
        }
        const inner = atom.code ? "punct" : classify(atom.ch);
        if (punctuation && inner === "punct" && edgeAfter(atoms, end - 1) === "other") {
          if (atom.code) {
            while (end > start && (atoms[end - 1] as CharAtom).code) {
              (atoms[end - 1] as CharAtom)[mark] = false;
              end -= 1;
            }
          } else {
            atom[mark] = false;
            end -= 1;
          }
          continue;
        }
        break;
      }
    }
  }
  return atoms;
}

/* -------------------------------------------------------------------------- */
/* Writing inline markdown                                                     */
/* -------------------------------------------------------------------------- */

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const ENTITY = /^&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;

/**
 * Text, with every character markdown would read as syntax escaped.
 *
 * Underscores inside a word stay bare (`snake_case`, `@sam_x`): they can
 * never open or close emphasis, and escaping them would split a handle. Block
 * syntax is only syntax at the start of a line, so it is only escaped there.
 */
function escapeText(text: string, lineStart: boolean, previous: string): string {
  const chars = Array.from(text);
  let out = "";
  let prev = previous;
  let i = 0;
  if (lineStart) {
    const ordered = /^(\d{1,9})([.)])/.exec(text);
    if (ordered) {
      out += `${ordered[1]}\\${ordered[2]}`;
      i = ordered[0].length;
      prev = ordered[2]!;
    } else if (/^[#>+=-]/.test(text)) {
      out += `\\${text[0]}`;
      i = 1;
      prev = text[0]!;
    }
  }
  for (; i < chars.length; i += 1) {
    const ch = chars[i]!;
    switch (ch) {
      case "\\":
      case "*":
      case "`":
      case "[":
      case "]":
      case "<":
      case "|":
      case "~":
        out += `\\${ch}`;
        break;
      case "_":
        out += LETTER_OR_DIGIT.test(prev) ? "_" : "\\_";
        break;
      case "(":
        // marked un-escapes `\[` and `\]` inside a link's text before reading
        // it, so a typed `[x](y)` there would turn into a link in a link and
        // the outer link would be dropped.
        out += prev === "]" ? "\\(" : "(";
        break;
      case "&":
        out += ENTITY.test(chars.slice(i, i + 40).join("")) ? "\\&" : "&";
        break;
      case "@":
        // A handle that is not a link here must not become one.
        out += /^[a-z0-9_]{2}/i.test(chars.slice(i + 1, i + 3).join("")) ? "\\@" : "@";
        break;
      default:
        out += ch;
    }
    prev = ch;
  }
  return out;
}

function codeSpan(text: string, inTable: boolean): string {
  let content = text.replace(/\n/g, " ");
  if (inTable) content = content.replace(/\|/g, "\\|");
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad =
    content.startsWith("`") ||
    content.endsWith("`") ||
    (content.startsWith(" ") && content.endsWith(" ") && content.trim() !== "")
      ? " "
      : "";
  return `${fence}${pad}${content}${pad}${fence}`;
}

function destination(url: string): string {
  const safe = url
    .replace(/[\s<>]/g, (char) => encodeURIComponent(char))
    .replace(/\\/g, "%5C");
  return /[()]/.test(safe) ? `<${safe}>` : safe;
}

function titlePart(title: string | null): string {
  if (!title) return "";
  return ` "${title.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

const MEMBER_PATH = /^\/members\/([a-z0-9_]{2,32})$/i;
/** What may not stand right before a handle for the renderer to link it. */
const BEFORE_HANDLE = /[\p{L}\p{N}_`\]/[@]/u;

type Open = { kind: "link" | Mark; key: string; link?: Link; plain?: boolean };

type Emitted = { markdown: string; formatted: boolean };

function emit(atoms: readonly Atom[], inTable: boolean, italic = "*"): Emitted {
  const marker = (mark: Mark) => (mark === "em" ? italic : MARKER[mark]);
  // Each run of a mark, numbered, with where it ends: the key that keeps two
  // separate bold runs from being mistaken for one.
  const spans: Record<Mark, number[]> = { strong: [], em: [], del: [] };
  const ends: Record<Mark, number[]> = { strong: [0], em: [0], del: [0] };
  for (const mark of MARKS) {
    let id = 0;
    atoms.forEach((atom, index) => {
      if (!hasMark(atom, mark)) {
        spans[mark][index] = 0;
        return;
      }
      const previous = atoms[index - 1];
      if (!hasMark(previous, mark) || linkId(previous) !== linkId(atom)) id += 1;
      spans[mark][index] = id;
      ends[mark][id] = index;
    });
  }

  let out = "";
  let lineStart = true;
  let formatted = false;
  const stack: Open[] = [];

  const close = (open: Open) => {
    if (open.kind === "link") {
      if (!open.plain) out += `](${destination(open.link!.href)}${titlePart(open.link!.title)})`;
      return;
    }
    out += marker(open.kind);
  };

  /** The link as a bare `@handle`, when the renderer will link it the same. */
  const asPlainHandle = (link: Link, from: number): boolean => {
    const member = MEMBER_PATH.exec(link.href);
    if (!member) return false;
    let text = "";
    let end = from;
    while (end < atoms.length && linkId(atoms[end]) === link.id) {
      const atom = atoms[end]!;
      if (atom.kind !== "char" || atom.code) return false;
      for (const mark of MARKS) if (spans[mark][end] !== spans[mark][from]) return false;
      text += atom.ch;
      end += 1;
    }
    const handle = member[1]!;
    if (text.toLowerCase() !== `@${handle.toLowerCase()}`) return false;
    if (handle.startsWith("_") || handle.endsWith("_")) return false;
    const atom = atoms[from] as CharAtom;
    const marked = atom.strong || atom.em || atom.del;
    if (!marked && BEFORE_HANDLE.test(out.slice(-1))) return false;
    const after = atoms[end];
    if (after?.kind === "char" && /[a-z0-9_]/i.test(after.ch) && linkId(after) === 0) return false;
    return true;
  };

  const open = (entry: Open, index: number) => {
    if (entry.kind === "link") {
      entry.plain = asPlainHandle(entry.link!, index);
      if (!entry.plain) {
        // A typed `!` right before the bracket would make the link an image.
        if (out.endsWith("!")) out = `${out.slice(0, -1)}\\!`;
        out += "[";
      }
    } else {
      out += marker(entry.kind);
      formatted = true;
    }
    stack.push(entry);
    lineStart = false;
  };

  let i = 0;
  while (i < atoms.length) {
    const atom = atoms[i]!;
    if (atom.kind === "br") {
      while (stack.length) close(stack.pop()!);
      out = out.replace(/[ \t]+$/, "");
      out += "\n";
      lineStart = true;
      i += 1;
      continue;
    }

    // What this run needs open: its link outermost, then its marks, longest first.
    const wanted: (Open & { end: number })[] = [];
    if (atom.link) wanted.push({ kind: "link", key: `l${atom.link.id}`, link: atom.link, end: Infinity });
    if (atom.kind === "char") {
      for (const mark of MARKS) {
        const id = spans[mark][i]!;
        if (id) wanted.push({ kind: mark, key: `${mark}${id}`, end: ends[mark][id]! });
      }
    }
    const keys = new Set(wanted.map((entry) => entry.key));
    const cut = stack.findIndex((entry) => !keys.has(entry.key));
    const reopen = cut === -1 ? [] : stack.slice(cut).filter((entry) => keys.has(entry.key));
    if (cut !== -1) while (stack.length > cut) close(stack.pop()!);
    const missing = wanted
      .filter(
        (entry) =>
          !stack.some((openEntry) => openEntry.key === entry.key) &&
          !reopen.some((again) => again.key === entry.key),
      )
      .sort((a, b) =>
        a.kind === "link" ? -1 : b.kind === "link" ? 1 : b.end - a.end || MARKS.indexOf(a.kind as Mark) - MARKS.indexOf(b.kind as Mark),
      );
    const opening = [...reopen, ...missing];
    for (const entry of opening) if (entry.kind === "link") open(entry, i);

    if (atom.kind === "image") {
      for (const entry of opening) if (entry.kind !== "link") open(entry, i);
      out += `![${escapeText(atom.alt, false, "[").replace(/\n/g, " ")}](${destination(atom.src)}${titlePart(atom.title)})`;
      lineStart = false;
      i += 1;
      continue;
    }

    // The run: every following character with the same link, marks and code.
    let j = i;
    let text = "";
    while (j < atoms.length) {
      const next = atoms[j]!;
      if (next.kind !== "char" || next.code !== atom.code || linkId(next) !== linkId(atom)) break;
      if (MARKS.some((mark) => spans[mark][j] !== spans[mark][i])) break;
      text += next.ch;
      j += 1;
    }
    // A marker reopened after another one closed may land on a space, and a
    // marker followed by a space opens nothing: the space goes first.
    if (!atom.code && opening.some((entry) => entry.kind !== "link")) {
      const lead = /^ +/.exec(text)?.[0] ?? "";
      out += lead;
      text = text.slice(lead.length);
    }
    for (const entry of opening) if (entry.kind !== "link") open(entry, i);
    const link = stack.find((entry) => entry.kind === "link");
    const member = link?.link ? MEMBER_PATH.exec(link.link.href) : null;
    if (atom.code) {
      // Inside a link's text marked reads a code span up to its first
      // backtick and un-escapes brackets in it, so code that holds a backtick
      // or a backslash is written there as plain text: the words survive, the
      // code styling does not.
      const inLinkText = stack.some((entry) => entry.kind === "link" && !entry.plain);
      out += inLinkText && /[`\\]/.test(text) ? escapeText(text, lineStart, out.slice(-1)) : codeSpan(text, inTable);
    } else if (
      member &&
      text.toLowerCase() === `@${member[1]!.toLowerCase()}` &&
      !(member[1]!.startsWith("_") && member[1]!.endsWith("_"))
    ) {
      // A handle is written as typed, so the renderer counts the mention.
      out += text;
    } else {
      out += escapeText(text, lineStart, out.slice(-1));
    }
    lineStart = false;
    i = j;
  }
  while (stack.length) close(stack.pop()!);
  return { markdown: out.replace(/[ \t]+$/gm, ""), formatted };
}

/* -------------------------------------------------------------------------- */
/* Checking the result                                                         */
/* -------------------------------------------------------------------------- */

/** Atoms as one comparable string: text, formatting and link targets. */
function signature(atoms: readonly Atom[]): string {
  let out = "";
  for (const atom of atoms) {
    if (atom.kind === "br") out += "\n";
    else if (atom.kind === "image") out += `\u0001img:${atom.src}\u0001`;
    else if (atom.ch === " " && !atom.code) out += ` ${atom.link?.href ?? ""}\u0002`;
    else {
      out += `${atom.ch}${atom.strong ? "b" : ""}${atom.em ? "i" : ""}${atom.del ? "s" : ""}${atom.code ? "c" : ""}${atom.link?.href ?? ""}\u0002`;
    }
  }
  return out;
}

const checked = new Map<string, boolean>();
const CHECKED_LIMIT = 500;

/** Whether the renderer reads `markdown` back as exactly these atoms. */
function rendersAs(markdown: string, atoms: readonly Atom[]): boolean {
  const expected = signature(atoms);
  const key = `${markdown}\u0000${expected}`;
  const known = checked.get(key);
  if (known !== undefined) return known;

  let ok = true;
  const rendered: Atom[] = [];
  const ctx: Context = { links: 0, mentions: 0, degraded: 0 };
  let paragraphs = 0;
  for (const node of parseRichHtml(renderRichText(markdown))) {
    if (node.type === "text") {
      if (node.text.trim()) ok = false;
      continue;
    }
    if (node.tag !== "p") {
      ok = false;
      break;
    }
    if (paragraphs > 0) rendered.push(BREAK, BREAK);
    paragraphs += 1;
    const collected: Collected[] = [];
    collect(node.children, PLAIN, collected, ctx);
    for (const item of collected) {
      if (item.kind === "block") ok = false;
      else rendered.push(item);
    }
  }
  if (ok) ok = signature(tidy(rendered, false)) === expected;

  if (checked.size >= CHECKED_LIMIT) {
    const oldest = checked.keys().next().value;
    if (oldest !== undefined) checked.delete(oldest);
  }
  checked.set(key, ok);
  return ok;
}

function without(atoms: readonly Atom[], marks: readonly Mark[]): Atom[] {
  return atoms.map((atom) => {
    if (atom.kind !== "char") return atom;
    const copy = { ...atom };
    for (const mark of marks) copy[mark] = false;
    return copy;
  });
}

type InlineOptions = { singleLine?: boolean; table?: boolean; heading?: boolean };

/**
 * The attempts, in order. Formatting exactly as it was; then with edge
 * punctuation moved outside a marker the renderer refused; then without
 * strikethrough, without italic, and without bold. The words are the same in
 * every one.
 */
const ATTEMPTS: readonly { punctuation: boolean; italic: string; dropped: readonly Mark[] }[] = [
  { punctuation: false, italic: "*", dropped: [] },
  { punctuation: true, italic: "*", dropped: [] },
  // Italic written with underscores never merges with the asterisks of a bold
  // run, which is where the renderer most often reads interleaved bold and
  // italic differently from how they were written.
  { punctuation: false, italic: "_", dropped: [] },
  { punctuation: true, italic: "_", dropped: [] },
  { punctuation: true, italic: "*", dropped: ["del"] },
  { punctuation: true, italic: "*", dropped: ["del", "em"] },
  { punctuation: true, italic: "*", dropped: ["del", "em", "strong"] },
];

/** Inline content (a paragraph, a heading, a table cell) as markdown. */
function inline(input: readonly Atom[], options: InlineOptions, ctx: Context): string {
  const atoms = tidy(input, Boolean(options.singleLine));
  if (!atoms.length) return "";
  linkify(atoms, ctx);

  const finish = (markdown: string) =>
    options.heading ? markdown.replace(/(^|\s)(#+)$/, "$1\\$2") : markdown;

  let last = "";
  for (const attempt of ATTEMPTS) {
    const hugged = hug(atoms, attempt.punctuation);
    const candidate = attempt.dropped.length ? without(hugged, attempt.dropped) : hugged;
    const { markdown, formatted } = emit(candidate, Boolean(options.table), attempt.italic);
    last = finish(markdown);
    // Tables are read cell by cell by the renderer, so a cell is not checked
    // on its own; everything else with formatting is.
    if (!formatted || options.table || rendersAs(last, candidate)) {
      if (attempt.dropped.length) ctx.degraded += 1;
      return last;
    }
  }
  ctx.degraded += 1;
  return last;
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

type Block = { kind: "text" | "list"; text: string };

function atomsOf(nodes: readonly EditorNode[], ctx: Context): Collected[] {
  const collected: Collected[] = [];
  collect(nodes, PLAIN, collected, ctx);
  return collected;
}

function paragraphs(nodes: readonly EditorNode[], ctx: Context): Block[] {
  const groups: Atom[][] = [[]];
  for (const item of atomsOf(nodes, ctx)) {
    if (item.kind === "block") groups.push([]);
    else groups[groups.length - 1]!.push(item);
  }
  return groups
    .map((group) => inline(group, {}, ctx))
    .filter(Boolean)
    .map((text) => ({ kind: "text", text }));
}

function singleLine(nodes: readonly EditorNode[], options: InlineOptions, ctx: Context): string {
  const atoms = atomsOf(nodes, ctx).map((item) => (item.kind === "block" ? BREAK : item));
  return inline(atoms, { ...options, singleLine: true }, ctx);
}

function heading(node: EditorElement, ctx: Context): Block[] {
  const text = singleLine(node.children, { heading: true }, ctx);
  if (!text) return [];
  const level = node.tag === "h3" ? 3 : node.tag === "h4" ? 4 : 2;
  return [{ kind: "text", text: `${"#".repeat(level)} ${text}` }];
}

function quote(node: EditorElement, ctx: Context): Block[] {
  const inner = joinBlocks(blocks(node.children, ctx));
  if (!inner) return [];
  return [
    {
      kind: "text",
      text: inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n"),
    },
  ];
}

function codeBlock(node: EditorElement): Block[] {
  const text = textOf(node.children)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n$/, "");
  if (!text.trim()) return [];
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return [{ kind: "text", text: `${fence}\n${text}\n${fence}` }];
}

function tableRows(node: EditorElement): EditorElement[] {
  const rows: EditorElement[] = [];
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tag === "tr") rows.push(child);
    else if (child.tag === "thead" || child.tag === "tbody") rows.push(...tableRows(child));
  }
  return rows;
}

function table(node: EditorElement, ctx: Context): Block[] {
  const rows = tableRows(node).map((row) =>
    row.children.filter(
      (cell): cell is EditorElement =>
        cell.type === "element" && (cell.tag === "th" || cell.tag === "td"),
    ),
  );
  const width = Math.max(0, ...rows.map((cells) => cells.length));
  if (!rows.length || width === 0) return [];
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, index) => cells[index] ?? "").join(" | ")} |`;
  const render = (cells: EditorElement[]) =>
    cells.map((cell) => singleLine(cell.children, { table: true }, ctx));
  const align = Array.from({ length: width }, (_, index) => {
    const value = rows[0]![index]?.attrs.align;
    return value === "center" ? ":---:" : value === "right" ? "---:" : value === "left" ? ":---" : "---";
  });
  return [
    {
      kind: "text",
      text: [line(render(rows[0]!)), line(align), ...rows.slice(1).map((cells) => line(render(cells)))].join(
        "\n",
      ),
    },
  ];
}

function joinItem(parts: readonly Block[]): string {
  let out = "";
  parts.forEach((part, index) => {
    if (index > 0) out += part.kind === "list" ? "\n" : "\n\n";
    out += part.text;
  });
  return out;
}

function list(node: EditorElement, alternate: boolean, ctx: Context): string {
  const ordered = node.tag === "ol";
  const start = Number.parseInt(node.attrs.start ?? "", 10);
  let number = ordered && Number.isFinite(start) ? Math.min(Math.max(start, 0), 999_999_999) : 1;
  const items: Block[][] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      if (child.text.trim()) items.push(paragraphs([child], ctx));
      continue;
    }
    if (child.tag === "li") {
      items.push(blocks(child.children, ctx));
    } else if (child.tag === "ul" || child.tag === "ol") {
      // A list straight inside a list belongs to the item before it.
      const nested = list(child, false, ctx);
      if (!nested) continue;
      const previous = items[items.length - 1];
      if (previous) previous.push({ kind: "list", text: nested });
      else items.push([{ kind: "list", text: nested }]);
    } else {
      const content = BLOCK_TAGS.has(child.tag) ? blocks([child], ctx) : paragraphs([child], ctx);
      if (content.length) items.push(content);
    }
  }
  const lines: string[] = [];
  for (const parts of items) {
    if (!parts.length) continue;
    const marker = ordered ? `${number}${alternate ? ")" : "."} ` : `${alternate ? "*" : "-"} `;
    number += 1;
    const indent = " ".repeat(marker.length);
    lines.push(
      joinItem(parts)
        .split("\n")
        .map((line, index) => (index === 0 ? `${marker}${line}` : line ? `${indent}${line}` : ""))
        .join("\n"),
    );
  }
  return lines.join("\n");
}

function block(node: EditorElement, ctx: Context): Block[] {
  switch (node.tag) {
    case "h2":
    case "h3":
    case "h4":
      return heading(node, ctx);
    case "blockquote":
      return quote(node, ctx);
    case "pre":
      return codeBlock(node);
    case "hr":
      return [{ kind: "text", text: "---" }];
    case "table":
      return table(node, ctx);
    default:
      // p, div, and table parts or list items found outside their table or list.
      return blocks(node.children, ctx);
  }
}

function blocks(nodes: readonly EditorNode[], ctx: Context): Block[] {
  const out: Block[] = [];
  let pending: EditorNode[] = [];
  // Two lists of one kind in a row would merge into one; the second takes the
  // other marker, which is what keeps them apart.
  const last = { list: null as { tag: string; alternate: boolean } | null };

  const flush = () => {
    if (!pending.length) return;
    const found = paragraphs(pending, ctx);
    pending = [];
    if (found.length) {
      out.push(...found);
      last.list = null;
    }
  };

  for (const node of nodes) {
    if (node.type === "element" && BLOCK_TAGS.has(node.tag)) {
      flush();
      if (node.tag === "ul" || node.tag === "ol") {
        const previous = last.list;
        const alternate = previous !== null && previous.tag === node.tag ? !previous.alternate : false;
        const text = list(node, alternate, ctx);
        if (text) {
          out.push({ kind: "list", text });
          last.list = { tag: node.tag, alternate };
        }
        continue;
      }
      const found = block(node, ctx);
      if (found.length) {
        out.push(...found);
        last.list = null;
      }
      continue;
    }
    pending.push(node);
  }
  flush();
  return out;
}

function joinBlocks(parts: readonly Block[]): string {
  return parts.map((part) => part.text).join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Entry points                                                                */
/* -------------------------------------------------------------------------- */

export type MarkdownReport = {
  markdown: string;
  /** Paragraphs whose formatting was reduced so it renders without stray markers. */
  degraded: number;
};

/** The editor's HTML as markdown, with a note of any formatting it had to drop. */
export function htmlToMarkdownReport(html: string | null | undefined): MarkdownReport {
  const ctx: Context = { links: 0, mentions: 0, degraded: 0 };
  const markdown = joinBlocks(blocks(parseRichHtml(html), ctx)).replace(/\s+$/, "");
  return { markdown, degraded: ctx.degraded };
}

/**
 * The editor's HTML as the markdown a post stores.
 *
 * `renderRichText(htmlToMarkdown(html))` shows the same words with the same
 * formatting the editor showed. Raw HTML never survives: anything outside the
 * editor's structure is reduced to its text first.
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  return htmlToMarkdownReport(html).markdown;
}
