"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Smile,
  X,
} from "lucide-react";
import { Button, fieldClass, menuClass, menuItemClass } from "@/components/app/ui";
import {
  htmlToPlainLines,
  literalTextToHtml,
  markdownToEditorHtml,
  pastedTextToHtml,
  sanitizePastedHtml,
} from "@/lib/content/editor-html";
import {
  formatState,
  linkFromInput,
  mentionQuery,
  nextToolIndex,
  NO_FORMAT,
  roomLeft,
  sameFormat,
  type FormatState,
} from "@/lib/content/editor-input";
import { htmlToMarkdown } from "@/lib/content/html-to-markdown";
import { safeImageSrc } from "@/lib/content/urls";
import { GIF_ACCEPT, kindOf } from "@/lib/uploads/policy";
import { cn } from "@/lib/utils";

/**
 * The writing surface: what you see is what the post shows.
 *
 * Bold is bold while you write, a list is a list, a link is a link — the
 * client's report was pressing Bold and getting `**text**`. It is a
 * contenteditable region edited through the browser's own commands, so typing,
 * Ctrl/⌘+Z and Ctrl/⌘+Y, spellcheck, autocorrect and the phone keyboard all
 * behave as they do everywhere else.
 *
 * The stored body does not change format. On every edit the surface is
 * serialized back to the markdown `renderRichText` reads
 * (`lib/content/html-to-markdown`), and `value`/`onChange` carry that
 * markdown, so the server actions, the feed and search see exactly what they
 * saw before. A body loaded for editing is rendered by the same pipeline the
 * post uses, so it opens formatted.
 *
 * No raw HTML gets in: a paste or a drop is reduced to paragraphs, line
 * breaks, bold, italic, lists and checked links before it is inserted
 * (`lib/content/editor-html`), and the serializer reads nothing else anyway.
 * Underline, colours and fonts are refused at the keyboard, because the post
 * could not show them.
 */

type Person = { handle: string; name: string; avatarUrl: string | null };

const EMOJI = [
  "😀", "😂", "🥰", "😍", "🤔", "👏", "🙌", "💪",
  "🔥", "✨", "💚", "🌱", "🥑", "🍅", "🍋", "🥕",
  "🍲", "🥗", "🍜", "🍞", "🧄", "🌶️", "🫒", "🥦",
  "👍", "❤️", "🎉", "😋", "🤤", "😅", "🙏", "👀",
];

export type GifChoice = {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
};

/** One empty paragraph, so the first keystroke lands in a paragraph. */
const EMPTY_HTML = "<p><br></p>";

/**
 * Shortcut hints name both modifier keys rather than sniffing the platform,
 * which would render differently on the server and in the browser.
 */
function shortcut(keys: string) {
  return {
    hint: `Ctrl/⌘+${keys}`,
    aria: `Control+${keys} Meta+${keys}`,
  };
}

type ToolKey = "bold" | "italic" | "heading" | "bulleted" | "numbered" | "quote" | "link" | "emoji" | "gif";

/** The toolbar, in order. Formatting toggles first, then the two pickers. */
const TOOLS: readonly {
  key: ToolKey;
  label: string;
  Icon: typeof Bold | null;
  shortcut?: { hint: string; aria: string };
}[] = [
  { key: "bold", label: "Bold", Icon: Bold, shortcut: shortcut("B") },
  { key: "italic", label: "Italic", Icon: Italic, shortcut: shortcut("I") },
  { key: "heading", label: "Heading", Icon: Heading2 },
  { key: "bulleted", label: "Bulleted list", Icon: List, shortcut: shortcut("Shift+8") },
  { key: "numbered", label: "Numbered list", Icon: ListOrdered, shortcut: shortcut("Shift+7") },
  { key: "quote", label: "Quote", Icon: Quote },
  { key: "link", label: "Link", Icon: Link2, shortcut: shortcut("K") },
  { key: "emoji", label: "Emoji", Icon: Smile },
  { key: "gif", label: "GIF", Icon: null },
];

/**
 * Native formatting the stored markdown cannot carry. Refused before the
 * browser applies it, so the surface never shows what the post would not.
 */
const REFUSED_INPUT = new Set([
  "formatUnderline",
  "formatSuperscript",
  "formatSubscript",
  "formatJustifyFull",
  "formatJustifyCenter",
  "formatJustifyRight",
  "formatJustifyLeft",
  "formatIndent",
  "formatOutdent",
  "formatFontColor",
  "formatBackColor",
  "formatFontName",
]);

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The editor's elements from the caret outwards, for the toolbar's state. */
function ancestors(root: HTMLElement, from: Node | null) {
  const chain: { tag: string; style: string | null; href: string | null }[] = [];
  let element: Element | null =
    from && from.nodeType === Node.ELEMENT_NODE ? (from as Element) : (from?.parentElement ?? null);
  while (element && element !== root && root.contains(element)) {
    chain.push({
      tag: element.tagName,
      style: element.getAttribute("style"),
      href: element.getAttribute("href"),
    });
    element = element.parentElement;
  }
  return chain;
}

function closestWithin(root: HTMLElement, node: Node | null, selector: string): HTMLElement | null {
  const start = node && node.nodeType === Node.ELEMENT_NODE ? (node as Element) : (node?.parentElement ?? null);
  const found = start?.closest<HTMLElement>(selector) ?? null;
  return found && root.contains(found) && found !== root ? found : null;
}

export function RichEditor({
  name,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  disabled,
  onGif,
  onGifFiles,
  onFiles,
  id,
  label,
  labelledBy,
  describedBy,
  invalid,
  collapsed = false,
  onFocus,
}: {
  /** The form field the markdown is posted under (a hidden input carries it). */
  name: string;
  /** The body as markdown. Controlled: set it to "" to clear the editor. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** How many lines tall the empty editor is. */
  rows?: number;
  /** In characters of stored markdown, as the server counts them. */
  maxLength?: number;
  disabled?: boolean;
  /**
   * Overrides what a chosen GIF does. By default it is inserted into the body
   * as an image, which is stored as markdown the renderer and the sanitiser
   * already understand — the upload pipeline only accepts files in our own
   * bucket, and a GIF on Tenor's CDN is not one.
   */
  onGif?: (gif: GifChoice) => void;
  /**
   * Hands GIF files picked from the device to the composer's own uploads, so
   * they attach (and play) like any other upload. Without it the GIF panel
   * points at the composer's photo button instead.
   */
  onGifFiles?: (files: File[]) => void;
  /**
   * Photos and videos pasted or dropped into the editor, handed to the
   * composer's uploads. Without it they are ignored; a file is never inserted
   * into the text.
   */
  onFiles?: (files: File[]) => void;
  /** Id of the editable region, for a `<label htmlFor>` and the toolbar. */
  id?: string;
  /** Accessible name, when no visible label points at `id`. */
  label?: string;
  /** Id of a visible label for the region. */
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
  /** One quiet line with no toolbar: the composer at rest. */
  collapsed?: boolean;
  onFocus?: () => void;
}) {
  const generated = useId();
  const editorId = id ?? `${generated}-editor`;
  const panelId = `${generated}-panel`;
  const listboxId = `${generated}-people`;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const gifFileRef = useRef<HTMLInputElement>(null);
  /** The markdown last sent up (or last loaded), so an outside change can be told apart. */
  const emitted = useRef(value);
  const savedRange = useRef<Range | null>(null);
  const mentionTarget = useRef<{ node: Text; start: number; end: number } | null>(null);
  const internalDrag = useRef(false);
  /** When Ctrl/⌘+Shift+V was pressed: the paste that follows is taken literally. */
  const literalPaste = useRef(0);

  // Rendered once, on the server and in the browser alike; the surface owns
  // its DOM from then on and React never rewrites it. One object for the
  // component's life: React 19 compares `dangerouslySetInnerHTML` by identity,
  // and a fresh object on each render would reset the text being typed.
  const [initialHtml] = useState(() => ({ __html: markdownToEditorHtml(value) || EMPTY_HTML }));
  /** Whether the surface holds more than an empty line, for the markdown it last sent. */
  const [layout, setLayout] = useState<{ forValue: string; blank: boolean }>({
    forValue: value,
    blank: true,
  });
  const [format, setFormat] = useState<FormatState>(NO_FORMAT);
  const [panel, setPanel] = useState<"emoji" | "gif" | "link" | null>(null);
  const [linkSeed, setLinkSeed] = useState<{ url: string; editing: boolean }>({ url: "", editing: false });
  const [mention, setMention] = useState<{ query: string; top: number; left: number } | null>(null);
  // Kept with the query they answer, so a result arriving after the query
  // has moved on is not shown against the wrong prefix.
  const [results, setResults] = useState<{ query: string; people: Person[] }>({
    query: "",
    people: [],
  });
  // Kept with its query too, so a new prefix starts at the first person.
  const [highlight, setHighlight] = useState({ query: "", index: 0 });
  const [toolIndex, setToolIndex] = useState(0);

  const empty =
    value.trim() === "" && (layout.forValue === value ? layout.blank : true);

  /* ------------------------------------------------------------------------ */
  /* Keeping the markdown and the surface in step                             */
  /* ------------------------------------------------------------------------ */

  // A value changed from outside (cleared after posting, a draft restored):
  // the surface is rebuilt from it. Typing never comes through here, because
  // every edit records what it sent before the parent hands it back.
  useIsomorphicLayoutEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const node = editorRef.current;
    if (node) node.innerHTML = markdownToEditorHtml(value) || EMPTY_HTML;
    savedRange.current = null;
    mentionTarget.current = null;
  }, [value]);

  const refreshFormat = useCallback(() => {
    const node = editorRef.current;
    const selection = typeof window === "undefined" ? null : window.getSelection();
    if (!node || !selection || selection.rangeCount === 0) return;
    const anchor = selection.anchorNode;
    if (!anchor || !node.contains(anchor)) return;
    const next = formatState(ancestors(node, anchor));
    // A Bold pressed with nothing selected applies to what is typed next;
    // the browser knows that before the DOM shows it.
    if (selection.isCollapsed && !next.heading) {
      try {
        next.bold = document.queryCommandState("bold");
        next.italic = document.queryCommandState("italic");
      } catch {
        // Keep the state read from the elements.
      }
    }
    setFormat((current) => (sameFormat(current, next) ? current : next));
  }, []);

  const detectMention = useCallback(() => {
    const node = editorRef.current;
    const wrapper = wrapperRef.current;
    const selection = window.getSelection();
    const clear = () => {
      mentionTarget.current = null;
      setMention((current) => (current ? null : current));
    };
    if (!node || !wrapper || !selection || !selection.isCollapsed || selection.rangeCount === 0) {
      clear();
      return;
    }
    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE || !node.contains(container)) {
      clear();
      return;
    }
    // Not inside a link (an existing mention) or code.
    if (closestWithin(node, container, "a,code,pre")) {
      clear();
      return;
    }
    const textNode = container as Text;
    const found = mentionQuery(textNode.data.slice(0, range.startOffset));
    if (!found) {
      clear();
      return;
    }
    const start = range.startOffset - found.length;
    if (start === 0) {
      // The `@` starts this text node: what comes before it in the line must
      // be a space or nothing, as it would be inside one node.
      const block = closestWithin(node, textNode, "p,div,li,h2,h3,h4,blockquote") ?? node;
      const before = document.createRange();
      before.setStart(block, 0);
      before.setEnd(textNode, 0);
      const preceding = before.toString();
      if (preceding && !/\s$/.test(preceding)) {
        clear();
        return;
      }
    }
    mentionTarget.current = { node: textNode, start, end: range.startOffset };
    const at = document.createRange();
    at.setStart(textNode, start);
    at.setEnd(textNode, Math.min(start + 1, textNode.length));
    const box = at.getBoundingClientRect();
    const frame = wrapper.getBoundingClientRect();
    const top = Math.round(box.bottom - frame.top + 6);
    const left = Math.round(Math.max(0, Math.min(box.left - frame.left, frame.width - 288)));
    setMention((current) =>
      current && current.query === found.query && current.top === top && current.left === left
        ? current
        : { query: found.query, top, left },
    );
  }, [setMention]);

  /** Reads the surface back to markdown and tells the parent if it changed. */
  const sync = useCallback(() => {
    const node = editorRef.current;
    if (!node) return;
    const markdown = htmlToMarkdown(node.innerHTML);
    const blank =
      !node.textContent?.trim() &&
      !node.querySelector("img,ul,ol,blockquote,pre,table,h2,h3,h4") &&
      node.querySelectorAll("p,div").length <= 1;
    setLayout((current) =>
      current.forValue === markdown && current.blank === blank ? current : { forValue: markdown, blank },
    );
    if (markdown !== emitted.current) {
      emitted.current = markdown;
      onChange(markdown);
    }
  }, [onChange]);

  /* ------------------------------------------------------------------------ */
  /* Selection                                                                */
  /* ------------------------------------------------------------------------ */

  const saveSelection = useCallback(() => {
    const node = editorRef.current;
    const selection = window.getSelection();
    if (!node || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (node.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange();
  }, []);

  /**
   * Focus the surface with the caret where it was (or at the end).
   *
   * While the surface has focus its live selection is the truth: the saved
   * copy trails it by a keystroke (selection events arrive late), and
   * restoring it would move the caret back under the person typing. The copy
   * is for coming back from a panel that took focus.
   */
  const restoreSelection = useCallback(() => {
    const node = editorRef.current;
    if (!node) return;
    const selection = window.getSelection();
    if (!selection) return;
    if (
      document.activeElement === node &&
      selection.rangeCount > 0 &&
      node.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
      return;
    }
    node.focus({ preventScroll: true });
    const saved = savedRange.current;
    if (saved && node.contains(saved.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(saved);
      return;
    }
    if (selection.rangeCount && node.contains(selection.getRangeAt(0).commonAncestorContainer)) return;
    const end = document.createRange();
    end.selectNodeContents(node);
    end.collapse(false);
    selection.removeAllRanges();
    selection.addRange(end);
  }, []);

  /** Runs one of the browser's editing commands, which joins its undo stack. */
  const run = useCallback(
    (command: string, argument?: string) => {
      const node = editorRef.current;
      if (!node || disabled) return false;
      restoreSelection();
      let done = false;
      try {
        done = document.execCommand(command, false, argument);
      } catch {
        done = false;
      }
      saveSelection();
      sync();
      refreshFormat();
      return done;
    },
    [disabled, refreshFormat, restoreSelection, saveSelection, sync],
  );

  // Selection changes are document-wide events: keep the toolbar state, the
  // caret to come back to, and the mention lookup current.
  useEffect(() => {
    const onSelection = () => {
      const node = editorRef.current;
      if (!node || document.activeElement !== node) return;
      saveSelection();
      refreshFormat();
      detectMention();
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [detectMention, refreshFormat, saveSelection]);

  // `beforeinput` is the one place a browser asks before it formats: refuse
  // what the post cannot show, and stop typing at the length limit.
  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    const onBeforeInput = (event: InputEvent) => {
      if (REFUSED_INPUT.has(event.inputType)) {
        event.preventDefault();
        return;
      }
      if (
        maxLength &&
        event.cancelable &&
        event.inputType.startsWith("insert") &&
        event.inputType !== "insertFromPaste" &&
        event.inputType !== "insertFromDrop" &&
        emitted.current.length >= maxLength
      ) {
        event.preventDefault();
      }
    };
    node.addEventListener("beforeinput", onBeforeInput);
    return () => node.removeEventListener("beforeinput", onBeforeInput);
  }, [maxLength]);

  // A visible `<label for>` cannot label a contenteditable region or focus it
  // on click, so the editor borrows it: its id names the region, and a click
  // on it puts the caret in.
  useEffect(() => {
    const node = editorRef.current;
    if (!node || !id) return;
    const element = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (!element) return;
    if (!label && !labelledBy) {
      if (!element.id) element.id = `${id}-label`;
      node.setAttribute("aria-labelledby", element.id);
    }
    const focus = (event: MouseEvent) => {
      event.preventDefault();
      node.focus();
    };
    element.addEventListener("click", focus);
    return () => element.removeEventListener("click", focus);
  }, [id, label, labelledBy]);

  /* ------------------------------------------------------------------------ */
  /* Mentions                                                                 */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!mention || mention.query.length < 1) return;
    const query = mention.query;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/community/mention-suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { people: Person[] };
        setResults({ query, people: data.people });
      } catch {
        // An aborted or failed lookup just means no suggestions.
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mention]);

  // Derived rather than stored: the list is only ever the answer to the
  // prefix currently being typed.
  const people =
    mention && mention.query.length >= 1 && results.query === mention.query ? results.people : [];
  const highlighted =
    mention && highlight.query === mention.query ? Math.min(highlight.index, Math.max(0, people.length - 1)) : 0;

  function choosePerson(person: Person) {
    const node = editorRef.current;
    const target = mentionTarget.current;
    const selection = window.getSelection();
    if (!node || !target || !selection || !node.contains(target.node)) return;
    const range = document.createRange();
    range.setStart(target.node, Math.min(target.start, target.node.length));
    range.setEnd(target.node, Math.min(target.end, target.node.length));
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange.current = range.cloneRange();
    const handle = person.handle;
    // A link the post renders the same way, then a space to type on from.
    run(
      "insertHTML",
      `<a href="/members/${encodeURIComponent(handle)}">@${escapeHtml(handle)}</a>\u00a0`,
    );
    mentionTarget.current = null;
    setMention(null);
  }

  /* ------------------------------------------------------------------------ */
  /* Toolbar actions                                                          */
  /* ------------------------------------------------------------------------ */

  function bold() {
    if (format.heading) return;
    run("bold");
  }

  function italic() {
    if (format.heading) return;
    run("italic");
  }

  function heading() {
    run("formatBlock", format.heading ? "<p>" : "<h2>");
  }

  function quote() {
    if (format.quote) {
      run("formatBlock", "<p>");
      const node = editorRef.current;
      const selection = window.getSelection();
      if (node && selection?.anchorNode && closestWithin(node, selection.anchorNode, "blockquote")) {
        run("outdent");
      }
      return;
    }
    run("formatBlock", "<blockquote>");
  }

  /** The link the caret is in: the live caret while the editor has focus, else the saved one. */
  function currentLink(): HTMLAnchorElement | null {
    const node = editorRef.current;
    if (!node) return null;
    const selection = window.getSelection();
    const live =
      selection && selection.rangeCount > 0 && node.contains(selection.getRangeAt(0).commonAncestorContainer)
        ? selection.anchorNode
        : null;
    const anchor = live ?? savedRange.current?.startContainer ?? null;
    return closestWithin(node, anchor, "a[href]") as HTMLAnchorElement | null;
  }

  function openLink() {
    if (disabled) return;
    saveSelection();
    const existing = currentLink();
    setLinkSeed({ url: existing?.getAttribute("href") ?? "", editing: Boolean(existing) });
    setPanel("link");
  }

  function applyLink(href: string, typed: string) {
    const existing = currentLink();
    const selection = window.getSelection();
    restoreSelection();
    if (existing && selection) {
      const range = document.createRange();
      range.selectNodeContents(existing);
      selection.removeAllRanges();
      selection.addRange(range);
      run("createLink", href);
    } else if (!selection || selection.isCollapsed) {
      run("insertHTML", `<a href="${escapeHtml(href)}">${escapeHtml(typed || href)}</a>\u00a0`);
    } else {
      run("createLink", href);
    }
    window.getSelection()?.collapseToEnd();
    saveSelection();
    setPanel(null);
  }

  function removeLink() {
    const existing = currentLink();
    const selection = window.getSelection();
    restoreSelection();
    if (existing && selection) {
      const range = document.createRange();
      range.selectNodeContents(existing);
      selection.removeAllRanges();
      selection.addRange(range);
      run("unlink");
      window.getSelection()?.collapseToEnd();
    }
    setPanel(null);
  }

  function closePanel() {
    setPanel(null);
    restoreSelection();
  }

  function chooseGif(gif: GifChoice) {
    if (onGif) {
      onGif(gif);
      setPanel(null);
      return;
    }
    const src = safeImageSrc(gif.url);
    if (src) {
      const alt = gif.alt.replace(/\s+/g, " ").trim().slice(0, 120) || "GIF";
      run("insertHTML", `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`);
    }
    setPanel(null);
  }

  function insertEmoji(emoji: string) {
    run("insertText", emoji);
    setPanel(null);
  }

  /* ------------------------------------------------------------------------ */
  /* Paste, drop and files                                                    */
  /* ------------------------------------------------------------------------ */

  function handFiles(files: File[]) {
    const media = files.filter((file) => kindOf(file.type));
    if (!media.length) return;
    if (onFiles) onFiles(media);
    else if (onGifFiles) {
      const gifs = media.filter((file) => file.type === GIF_ACCEPT);
      if (gifs.length) onGifFiles(gifs);
    }
  }

  /** Inserts already-sanitized HTML, cut down to plain text if it would not fit. */
  function insertContent(html: string) {
    if (!html) return;
    const room = roomLeft(emitted.current.length, maxLength);
    if (room <= 0) return;
    if (Number.isFinite(room) && htmlToMarkdown(html).length + 2 > room) {
      const words = htmlToPlainLines(html).slice(0, Math.max(0, room - 2));
      if (words.trim()) run("insertHTML", literalTextToHtml(words));
      return;
    }
    run("insertHTML", html);
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    const data = event.clipboardData;
    const media = Array.from(data.files ?? []).filter((file) => kindOf(file.type));
    if (media.length) {
      // A screenshot or a copied photo: an attachment, never an inline image.
      // The HTML or file name that comes with it is not text to keep.
      handFiles(media);
      return;
    }
    const literal = literalPaste.current > 0 && event.timeStamp - literalPaste.current < 1000;
    literalPaste.current = 0;
    const text = data.getData("text/plain");
    let content = literal ? "" : sanitizePastedHtml(data.getData("text/html"));
    if (!content.trim() && text) content = literal ? literalTextToHtml(text) : pastedTextToHtml(text);
    if (content.trim()) insertContent(content);
  }

  function placeCaretAt(x: number, y: number) {
    const node = editorRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let range: Range | null = null;
    if (typeof doc.caretPositionFromPoint === "function") {
      const position = doc.caretPositionFromPoint(x, y);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    } else if (typeof doc.caretRangeFromPoint === "function") {
      range = doc.caretRangeFromPoint(x, y);
    }
    if (range && node.contains(range.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
      savedRange.current = range.cloneRange();
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    const data = event.dataTransfer;
    const files = Array.from(data.files ?? []);
    if (files.length) {
      event.preventDefault();
      handFiles(files);
      return;
    }
    // Moving text within the editor is the browser's own move.
    if (internalDrag.current) return;
    const html = data.getData("text/html");
    const text = data.getData("text/plain");
    if (!html && !text) return;
    event.preventDefault();
    placeCaretAt(event.clientX, event.clientY);
    insertContent(html ? sanitizePastedHtml(html) : pastedTextToHtml(text));
  }

  /* ------------------------------------------------------------------------ */
  /* Keyboard                                                                 */
  /* ------------------------------------------------------------------------ */

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (people.length > 0 && mention) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight({ query: mention.query, index: (highlighted + 1) % people.length });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight({ query: mention.query, index: (highlighted - 1 + people.length) % people.length });
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choosePerson(people[highlighted]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        mentionTarget.current = null;
        setMention(null);
        return;
      }
    }
    if (event.key === "Escape" && panel) {
      event.preventDefault();
      setPanel(null);
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (event.shiftKey) {
      if (key === "v") literalPaste.current = event.timeStamp;
      if (event.code === "Digit8") {
        event.preventDefault();
        run("insertUnorderedList");
      } else if (event.code === "Digit7") {
        event.preventDefault();
        run("insertOrderedList");
      }
      return;
    }
    if (key === "b") {
      event.preventDefault();
      bold();
    } else if (key === "i") {
      event.preventDefault();
      italic();
    } else if (key === "u") {
      // A post has no underline to show.
      event.preventDefault();
    } else if (key === "k") {
      event.preventDefault();
      openLink();
    }
  }

  function onFocusSurface() {
    // Firefox offers resize handles on images and tables; the post would not
    // keep the size. New lines are paragraphs in every browser.
    try {
      document.execCommand("enableObjectResizing", false, "false");
      document.execCommand("enableInlineTableEditing", false, "false");
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      // Not every browser knows every command.
    }
    refreshFormat();
    onFocus?.();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  const off = Boolean(disabled);
  const pressed: Partial<Record<ToolKey, boolean>> = {
    bold: format.bold,
    italic: format.italic,
    heading: format.heading,
    bulleted: format.bulleted,
    numbered: format.numbered,
    quote: format.quote,
    link: format.link,
  };
  const expanded: Partial<Record<ToolKey, boolean>> = {
    emoji: panel === "emoji",
    gif: panel === "gif",
  };
  // Bold and italic have nothing to add to a heading, which is bold already.
  const enabled = TOOLS.map(
    (tool) => !off && !(format.heading && (tool.key === "bold" || tool.key === "italic")),
  );
  // One tab stop for the whole toolbar; arrows move within it.
  const activeTool = enabled[toolIndex] ? toolIndex : enabled.indexOf(true);

  function toolAction(key: ToolKey) {
    switch (key) {
      case "bold":
        bold();
        break;
      case "italic":
        italic();
        break;
      case "heading":
        heading();
        break;
      case "bulleted":
        run("insertUnorderedList");
        break;
      case "numbered":
        run("insertOrderedList");
        break;
      case "quote":
        quote();
        break;
      case "link":
        if (panel === "link") closePanel();
        else openLink();
        break;
      case "emoji":
      case "gif":
        saveSelection();
        setPanel(panel === key ? null : key);
        break;
    }
  }

  function onToolbarKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const next = nextToolIndex(activeTool, event.key, enabled);
    if (next === null) return;
    event.preventDefault();
    setToolIndex(next);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tool]")[next]?.focus();
  }

  const minHeight = collapsed
    ? "calc(1.625em + 0.375rem)"
    : `calc(${Math.max(1, rows)} * 1.625em + 1.5rem + 2px)`;

  return (
    <div ref={wrapperRef} className="relative">
      {collapsed ? null : (
        <div
          role="toolbar"
          aria-label="Formatting"
          aria-controls={editorId}
          onKeyDown={onToolbarKeyDown}
          className="mb-2 flex flex-wrap items-center gap-0.5"
        >
          {TOOLS.map((tool, index) => (
            <Tool
              key={tool.key}
              label={tool.key === "link" && format.link ? "Edit link" : tool.label}
              icon={
                tool.Icon ? (
                  <tool.Icon className="size-4" aria-hidden />
                ) : (
                  <span className="text-micro font-semibold">GIF</span>
                )
              }
              onClick={() => toolAction(tool.key)}
              pressed={pressed[tool.key]}
              expanded={expanded[tool.key]}
              controls={expanded[tool.key] ? panelId : undefined}
              disabled={!enabled[index]}
              shortcut={tool.shortcut}
              tabIndex={index === activeTool ? 0 : -1}
              onFocus={() => setToolIndex(index)}
            />
          ))}
        </div>
      )}

      {!collapsed && panel === "emoji" ? (
        <div
          id={panelId}
          role="group"
          aria-label="Emoji"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closePanel();
            }
          }}
          className="mb-2 grid grid-cols-6 gap-1 rounded-ctl bg-surface-muted p-2 min-[420px]:grid-cols-8"
        >
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Insert ${emoji}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertEmoji(emoji)}
              className="grid h-9 place-items-center rounded-chip text-heading transition hover:bg-default"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {!collapsed && panel === "gif" ? (
        <GifPicker
          id={panelId}
          onPick={chooseGif}
          onUpload={onGifFiles ? () => gifFileRef.current?.click() : undefined}
          onClose={closePanel}
        />
      ) : null}

      {!collapsed && panel === "link" ? (
        <LinkPanel
          key={`${linkSeed.url}:${linkSeed.editing}`}
          id={panelId}
          initial={linkSeed.url}
          editing={linkSeed.editing}
          onApply={applyLink}
          onRemove={removeLink}
          onClose={closePanel}
        />
      ) : null}

      {onGifFiles ? (
        <input
          ref={gifFileRef}
          type="file"
          accept={GIF_ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const picked = event.currentTarget.files;
            if (picked?.length) onGifFiles(Array.from(picked));
            event.currentTarget.value = "";
            setPanel(null);
          }}
        />
      ) : null}

      <div className="relative">
        <div
          ref={editorRef}
          id={editorId}
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-placeholder={placeholder}
          aria-disabled={off || undefined}
          aria-invalid={invalid || undefined}
          aria-autocomplete="list"
          aria-controls={people.length ? listboxId : undefined}
          aria-activedescendant={people.length ? `${listboxId}-${highlighted}` : undefined}
          contentEditable={!off}
          spellCheck
          autoCapitalize="sentences"
          autoCorrect="on"
          inputMode="text"
          enterKeyHint="enter"
          dangerouslySetInnerHTML={initialHtml}
          onInput={() => {
            sync();
            detectMention();
            refreshFormat();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragStart={() => {
            internalDrag.current = true;
          }}
          onDragEnd={() => {
            internalDrag.current = false;
          }}
          onFocus={onFocusSurface}
          onBlur={() => {
            saveSelection();
            window.setTimeout(() => {
              mentionTarget.current = null;
              setMention(null);
            }, 150);
          }}
          style={{ minHeight }}
          className={cn(
            collapsed
              ? "block w-full border-0 bg-transparent p-0 pt-1.5 text-foreground outline-none"
              : fieldClass({ multiline: true, className: "block min-h-0 px-3.5 py-3" }),
            // The same type and rhythm as a post, so what is written here is
            // what the card shows. 16px on phones, where a smaller editable
            // font makes iOS zoom the page on focus.
            "prose-vu cursor-text text-title leading-relaxed sm:text-reading",
            "[&_p]:mb-2 [&_p:last-child]:mb-0 [&_img]:my-1 [&_u]:no-underline",
            "[&_table]:my-[0.6em] [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
            "aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
          )}
        />
        {empty && placeholder ? (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 select-none text-title leading-relaxed text-field-placeholder sm:text-reading",
              collapsed ? "truncate pt-1.5" : "border border-transparent px-3.5 py-3",
            )}
          >
            {placeholder}
          </div>
        ) : null}
      </div>

      {/* The markdown, under the field name the form has always posted. */}
      <input type="hidden" name={name} value={value} />

      <p className="sr-only" role="status" aria-live="polite">
        {people.length
          ? `${people.length} ${people.length === 1 ? "person" : "people"} found. Use the up and down arrows to choose, Enter to mention.`
          : ""}
      </p>

      {people.length > 0 && mention ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="People"
          style={{ top: mention.top, left: mention.left }}
          className={cn(menuClass, "absolute z-30 w-72 max-w-[calc(100%-0.5rem)]")}
        >
          {people.map((person, index) => (
            <li
              key={person.handle}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === highlighted}
              onMouseDown={(event) => {
                event.preventDefault();
                choosePerson(person);
              }}
              onMouseEnter={() => setHighlight({ query: mention.query, index })}
              className={cn(menuItemClass, "cursor-pointer", index === highlighted && "bg-surface-muted")}
            >
              <span className="truncate font-semibold text-foreground">{person.name}</span>
              <span className="truncate font-normal text-foreground-muted">@{person.handle}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Tool({
  label,
  icon,
  onClick,
  pressed,
  expanded,
  controls,
  disabled = false,
  shortcut,
  tabIndex,
  onFocus,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** A formatting toggle: whether the caret's text has it. */
  pressed?: boolean;
  /** A panel opener: whether its panel is open. */
  expanded?: boolean;
  controls?: string;
  disabled?: boolean;
  shortcut?: { hint: string; aria: string };
  tabIndex: number;
  onFocus: () => void;
}) {
  const active = pressed || expanded;
  return (
    <button
      type="button"
      data-tool
      onClick={onClick}
      onFocus={onFocus}
      disabled={disabled}
      tabIndex={tabIndex}
      title={shortcut ? `${label} (${shortcut.hint})` : label}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-expanded={expanded === undefined ? undefined : expanded}
      aria-controls={controls}
      aria-keyshortcuts={shortcut?.aria}
      // Keep the editor's selection: a button that takes focus first would
      // collapse it before the click handler reads it on some browsers.
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        "grid size-8 place-items-center rounded-ctl transition disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "bg-brand-wash text-on-brand-wash"
          : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}

/**
 * A link for the selection: its address, typed in a field of its own rather
 * than a browser prompt, so it can say what is wrong with an address and works
 * the same on a phone.
 */
function LinkPanel({
  id,
  initial,
  editing,
  onApply,
  onRemove,
  onClose,
}: {
  id: string;
  initial: string;
  editing: boolean;
  onApply: (href: string, typed: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initial);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function apply() {
    const href = linkFromInput(url);
    if (!href) {
      setError("Use a web address like https://example.com, or an email address.");
      inputRef.current?.focus();
      return;
    }
    onApply(href, url.trim());
  }

  return (
    <div id={id} role="group" aria-label="Link" className="mb-2 rounded-ctl bg-surface-muted p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-url`} className="sr-only">
          Link address
        </label>
        <input
          ref={inputRef}
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="url"
          value={url}
          placeholder="https://"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setUrl(event.currentTarget.value);
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          className={fieldClass({ size: "sm", className: "min-w-0 flex-1 basis-40" })}
        />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="primary" onClick={apply}>
            {editing ? "Update link" : "Add link"}
          </Button>
          {editing ? (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Remove link
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" iconOnly aria-label="Cancel link" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 px-0.5 text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type GifResult = {
  id: string;
  url: string;
  previewUrl: string;
  alt: string;
  width: number | null;
  height: number | null;
};

/**
 * GIF search.
 *
 * When no Tenor key is configured there is no search to show, so the panel
 * says so in a line and offers the one thing that does work: a GIF from the
 * device, which uploads and plays like any other attachment.
 */
function GifPicker({
  id,
  onPick,
  onUpload,
  onClose,
}: {
  id: string;
  onPick: (gif: GifChoice) => void;
  onUpload?: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/community/gifs?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as {
          configured?: boolean;
          gifs?: GifResult[];
        };
        setConfigured(data.configured ?? false);
        setGifs(data.gifs ?? []);
        setFailed(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const upload = onUpload ? (
    <Button size="sm" onClick={onUpload} className="shrink-0">
      <ImagePlus className="size-4" aria-hidden />
      Upload a GIF
    </Button>
  ) : null;

  if (configured === false) {
    return (
      <div
        id={id}
        className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-ctl bg-surface-muted px-3 py-2.5"
      >
        <p className="min-w-0 flex-1 text-label text-foreground-muted">
          {onUpload
            ? "GIF search isn’t switched on yet, but you can add a GIF from your device and it will play in your post."
            : "GIF search isn’t switched on yet."}
        </p>
        {upload}
      </div>
    );
  }

  return (
    <div id={id} className="mb-2 rounded-ctl bg-surface-muted p-2">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter in a search box inside a form would otherwise submit it.
            if (event.key === "Enter") event.preventDefault();
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder="Search GIFs"
          aria-label="Search GIFs"
          enterKeyHint="search"
          className={fieldClass({ className: "flex-1" })}
        />
        {upload}
      </div>
      {gifs.length > 0 ? (
        <div className="mt-2 grid max-h-56 grid-cols-3 gap-1 overflow-y-auto">
          {gifs.map((gif) => (
            <button
              key={gif.id}
              type="button"
              aria-label={`Insert GIF: ${gif.alt}`}
              onClick={() =>
                onPick({
                  url: gif.url,
                  alt: gif.alt,
                  width: gif.width,
                  height: gif.height,
                })
              }
              className="overflow-hidden rounded-chip bg-default transition hover:opacity-90"
            >
              {/* Remote GIF thumbnails from Tenor's CDN; the optimizer would
                  strip the animation. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gif.previewUrl} alt="" loading="lazy" className="h-20 w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      {loading ? (
        <p className="mt-1.5 px-0.5 text-caption text-foreground-muted">Searching…</p>
      ) : failed ? (
        <p className="mt-1.5 px-0.5 text-caption text-foreground-muted" role="status">
          GIF search isn’t answering right now. Try again in a moment.
        </p>
      ) : gifs.length === 0 && query ? (
        <p className="mt-1.5 px-0.5 text-caption text-foreground-muted">Nothing found.</p>
      ) : null}
    </div>
  );
}
