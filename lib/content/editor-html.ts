import {
  BLOCK_TAGS,
  parseRichHtml,
  styleMarks,
  writeHtml,
  type EditorElement,
  type EditorNode,
} from "@/lib/content/editor-tree";
import { renderRichText } from "@/lib/content/rich-text";
import { safeLinkHref } from "@/lib/content/urls";

/**
 * HTML going into the writing surface.
 *
 * Two directions, both through the same strict reader
 * (`lib/content/editor-tree`):
 *
 * - **A stored body, shown formatted.** Editing a post loads its markdown
 *   through `renderRichText` — the same render the post gets — so the editor
 *   opens on bold text, not on `**text**`.
 * - **Whatever is pasted or dropped.** Reduced to paragraphs, line breaks,
 *   bold, italic, lists and checked links. Scripts, images, styles, classes,
 *   event handlers, fonts and colours never arrive; a paste of plain text is
 *   read as markdown (the format a post is written in) and reduced the same
 *   way, so pasting `**bold**` from a notes app gives bold.
 */

function element(tag: string, children: EditorNode[], attrs: Record<string, string> = {}): EditorElement {
  return { type: "element", tag, attrs, children };
}

function text(value: string): EditorNode {
  return { type: "text", text: value };
}

// Plain booleans rather than type guards: "not a block" must not be read as
// "not an element".
function isBlock(node: EditorNode | undefined): boolean {
  return node?.type === "element" && BLOCK_TAGS.has(node.tag);
}

function isList(node: EditorNode | undefined): boolean {
  return node?.type === "element" && (node.tag === "ul" || node.tag === "ol");
}

function isBreak(node: EditorNode | undefined): boolean {
  return node?.type === "element" && node.tag === "br";
}

/** Containers whose whitespace-only text is the renderer's layout, never content. */
const LAYOUT_ONLY: ReadonlySet<string> = new Set([
  "#root",
  "ul",
  "ol",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
]);

/**
 * The renderer's output, made ready to edit: the newlines it writes between
 * blocks are dropped, because inside an editing surface they are characters
 * a caret can land on.
 */
function forEditing(nodes: readonly EditorNode[], parent: string): EditorNode[] {
  const out: EditorNode[] = [];
  nodes.forEach((node, index) => {
    if (node.type === "text") {
      if (!node.text.trim() && parent !== "pre") {
        const layout =
          LAYOUT_ONLY.has(parent) ||
          isBlock(nodes[index - 1]) ||
          isBlock(nodes[index + 1]) ||
          index === 0 ||
          index === nodes.length - 1;
        if (layout) return;
      }
      out.push(node);
      return;
    }
    out.push({
      ...node,
      children: node.tag === "pre" ? node.children : forEditing(node.children, node.tag),
    });
  });
  return out;
}

/**
 * A stored body as editor HTML: rendered exactly as the post renders, then
 * read back through the editor's allowlist. Empty for an empty body.
 */
export function markdownToEditorHtml(markdown: string | null | undefined): string {
  const html = renderRichText(markdown);
  if (!html) return "";
  return writeHtml(forEditing(parseRichHtml(html), "#root"));
}

/* -------------------------------------------------------------------------- */
/* Pasting                                                                     */
/* -------------------------------------------------------------------------- */

const BREAK = (): EditorElement => element("br", []);

/**
 * Wraps the inline stretches of `nodes` (and of any blocks inside them), so a
 * bold wrapper around two paragraphs becomes two bold paragraphs rather than
 * a paragraph inside a `<strong>`.
 */
function wrapInline(nodes: readonly EditorNode[], wrap: (inner: EditorNode[]) => EditorNode): EditorNode[] {
  const out: EditorNode[] = [];
  let run: EditorNode[] = [];
  const flush = () => {
    if (run.length) out.push(wrap(run));
    run = [];
  };
  for (const node of nodes) {
    if (node.type === "element" && isBlock(node)) {
      flush();
      out.push({ ...node, children: wrapInline(node.children, wrap) });
    } else {
      run.push(node);
    }
  }
  flush();
  return out;
}

/** Pasted structure reduced to what a paste may bring. */
function reduce(nodes: readonly EditorNode[], inPre: boolean): EditorNode[] {
  const out: EditorNode[] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      if (inPre) {
        node.text
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .forEach((part, index) => {
            if (index > 0) out.push(BREAK());
            if (part) out.push(text(part.replace(/\s/g, " ")));
          });
      } else {
        // Source formatting in pasted HTML is not content: one space for any run.
        const value = node.text.replace(/\s+/g, " ");
        if (value) out.push(text(value));
      }
      continue;
    }
    const children = reduce(node.children, inPre || node.tag === "pre");
    switch (node.tag) {
      case "strong":
      case "em":
      case "span": {
        const style = styleMarks(node.attrs.style);
        const bold = style.bold ?? node.tag === "strong";
        const italic = style.italic ?? node.tag === "em";
        let wrapped = children;
        if (italic) wrapped = wrapInline(wrapped, (inner) => element("em", inner));
        if (bold) wrapped = wrapInline(wrapped, (inner) => element("strong", inner));
        out.push(...wrapped);
        break;
      }
      case "a": {
        const href = safeLinkHref(node.attrs.href);
        out.push(...(href ? wrapInline(children, (inner) => element("a", inner, { href })) : children));
        break;
      }
      case "ul":
      case "ol": {
        const start = node.tag === "ol" ? Number.parseInt(node.attrs.start ?? "", 10) : Number.NaN;
        out.push(
          element(node.tag, children, Number.isFinite(start) && start !== 1 ? { start: String(start) } : {}),
        );
        break;
      }
      case "li":
        out.push(element("li", children));
        break;
      case "br":
        out.push(BREAK());
        break;
      case "table":
      case "thead":
      case "tbody":
        out.push(...children);
        break;
      case "th":
      case "td":
        // A table row reads as one line, its cells a space apart.
        out.push(...children, text(" "));
        break;
      case "img":
      case "hr":
        break;
      default:
        // Headings, quotes, code blocks, rows and generic blocks: paragraphs.
        if (BLOCK_TAGS.has(node.tag)) out.push(element("p", children));
        else out.push(...children);
    }
  }
  return out;
}

function hasContent(nodes: readonly EditorNode[]): boolean {
  return nodes.some((node) =>
    node.type === "text" ? node.text.trim() !== "" : node.tag === "br" || hasContent(node.children),
  );
}

/** Line breaks at either end of a paragraph are not lines. */
function trimBreaks(nodes: readonly EditorNode[]): EditorNode[] {
  const out = [...nodes];
  while (isBreak(out[0])) out.shift();
  while (isBreak(out[out.length - 1])) out.pop();
  return out;
}

/** An item's words; paragraphs inside it become lines, nested lists stay. */
function itemContent(nodes: readonly EditorNode[]): EditorNode[] {
  const out: EditorNode[] = [];
  for (const node of nodes) {
    if (node.type === "element" && isList(node)) {
      const nested = listOf(node);
      if (nested) {
        while (isBreak(out[out.length - 1])) out.pop();
        out.push(nested);
      }
      continue;
    }
    if (node.type === "element" && isBlock(node)) {
      const inner = itemContent(node.children);
      if (!hasContent(inner)) continue;
      const last = out[out.length - 1];
      if (out.length && !isBreak(last) && !isList(last)) out.push(BREAK());
      out.push(...inner);
      continue;
    }
    out.push(node);
  }
  return trimBreaks(out);
}

/** A list holding only items; a list straight inside a list joins the item before it. */
function listOf(node: EditorElement): EditorElement | null {
  const items: EditorElement[] = [];
  for (const child of node.children) {
    if (child.type === "element" && isList(child)) {
      const nested = listOf(child);
      if (!nested) continue;
      const previous = items[items.length - 1];
      if (previous) previous.children.push(nested);
      else items.push(element("li", [nested]));
      continue;
    }
    const content = itemContent(child.type === "element" && child.tag === "li" ? child.children : [child]);
    if (hasContent(content)) items.push(element("li", content));
  }
  return items.length ? element(node.tag, items, node.attrs) : null;
}

/** Block structure for insertion: paragraphs and lists, never a block inside a paragraph. */
function blocksOf(nodes: readonly EditorNode[]): EditorElement[] {
  const out: EditorElement[] = [];
  let inline: EditorNode[] = [];
  const flush = () => {
    const content = trimBreaks(inline);
    if (hasContent(content)) out.push(element("p", content));
    inline = [];
  };
  for (const node of nodes) {
    if (node.type === "element" && isList(node)) {
      flush();
      const list = listOf(node);
      if (list) out.push(list);
      continue;
    }
    if (node.type === "element" && isBlock(node)) {
      flush();
      if (node.tag === "li") {
        const content = itemContent(node.children);
        if (hasContent(content)) out.push(element("p", content));
      } else {
        out.push(...blocksOf(node.children));
      }
      continue;
    }
    inline.push(node);
  }
  flush();
  return out;
}

/**
 * The HTML to insert. A paste that is one paragraph goes in as its words, so
 * it joins the line the caret is on instead of splitting it.
 */
function forPaste(nodes: readonly EditorNode[]): string {
  const reduced = reduce(nodes, false);
  if (!reduced.some(isBlock)) return writeHtml(trimBreaks(reduced));
  const blocks = blocksOf(reduced);
  if (blocks.length === 1 && blocks[0]!.tag === "p") return writeHtml(blocks[0]!.children);
  return writeHtml(blocks);
}

/**
 * Rich clipboard HTML (a web page, a document, another post), reduced to
 * paragraphs, line breaks, bold, italic, lists and checked links.
 */
export function sanitizePastedHtml(html: string | null | undefined): string {
  return forPaste(parseRichHtml(html));
}

/**
 * Plain text pasted: read as markdown, the format posts are written in, then
 * reduced like any paste. Raw HTML in it is text (the renderer escapes it).
 */
export function pastedTextToHtml(value: string | null | undefined): string {
  const html = renderRichText(value);
  return html ? forPaste(parseRichHtml(html)) : "";
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Plain text exactly as typed (Ctrl/⌘+Shift+V): every character kept, lines
 * kept, nothing read as formatting.
 */
export function literalTextToHtml(value: string | null | undefined): string {
  const paragraphs = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.replace(/^\n+|\n+$/g, ""))
    .filter((paragraph) => paragraph.trim() !== "")
    .map((paragraph) => paragraph.split("\n").map(escapeText).join("<br>"));
  if (paragraphs.length === 1) return paragraphs[0]!;
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

/** The words of some HTML, one line per line, for when only part of a paste fits. */
export function htmlToPlainLines(html: string): string {
  const lines: string[] = [""];
  const walk = (nodes: readonly EditorNode[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        lines[lines.length - 1] += node.text;
      } else if (node.tag === "br") {
        lines.push("");
      } else if (BLOCK_TAGS.has(node.tag)) {
        lines.push("");
        walk(node.children);
        lines.push("");
      } else {
        walk(node.children);
      }
    }
  };
  walk(parseRichHtml(html));
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
