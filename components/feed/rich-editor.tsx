"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Smile,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The writing surface.
 *
 * A textarea with a toolbar, not a contenteditable rich-text engine. The body
 * is stored and rendered as markdown, so what someone types has to stay
 * markdown; a WYSIWYG surface would need a serialiser back to it, and every
 * such round trip is where formatting quietly changes under people.
 *
 * The toolbar wraps the selection rather than replacing it, keeps the
 * selection afterwards so a second button can be pressed, and leaves the
 * undo stack alone by writing through `setRangeText` rather than reassigning
 * the value.
 *
 * Mentions, emoji and GIFs all end up as text or as an attachment. Nothing
 * here invents a format the server does not already understand.
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

export function RichEditor({
  name,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  disabled,
  onGif,
  id,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  /**
   * Overrides what a chosen GIF does. By default it is inserted into the body
   * as a markdown image, which is a shape the renderer and the sanitiser
   * already understand — the upload pipeline only accepts files in our own
   * bucket, and a GIF on Tenor's CDN is not one.
   */
  onGif?: (gif: GifChoice) => void;
  id?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<"emoji" | "gif" | null>(null);
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null);
  // Kept with the query they answer, so a result arriving after the query
  // has moved on is not shown against the wrong prefix.
  const [results, setResults] = useState<{ query: string; people: Person[] }>({
    query: "",
    people: [],
  });
  const [highlight, setHighlight] = useState(0);

  /**
   * Writes into the textarea without destroying the undo stack.
   *
   * Assigning to `value` would make every formatting button an un-undoable
   * step, which is infuriating in a composer.
   */
  const splice = useCallback(
    (from: number, to: number, text: string, selectFrom = from + text.length) => {
      const node = ref.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(from, to);
      node.setRangeText(text, from, to, "end");
      onChange(node.value);
      requestAnimationFrame(() => {
        node.setSelectionRange(selectFrom, selectFrom);
      });
    },
    [onChange],
  );

  function wrap(before: string, after = before, placeholderText = "text") {
    const node = ref.current;
    if (!node) return;
    const { selectionStart: start, selectionEnd: end } = node;
    const selected = node.value.slice(start, end) || placeholderText;
    const next = `${before}${selected}${after}`;
    splice(start, end, next, start + before.length + selected.length);
  }

  function prefixLines(marker: string) {
    const node = ref.current;
    if (!node) return;
    const { selectionStart: start, selectionEnd: end } = node;
    const lineStart = node.value.lastIndexOf("\n", start - 1) + 1;
    const block = node.value.slice(lineStart, end) || "";
    const next = block
      .split("\n")
      .map((line, index) =>
        marker === "1. " ? `${index + 1}. ${line}` : `${marker}${line}`,
      )
      .join("\n");
    splice(lineStart, end, next);
  }

  function insertLink() {
    const node = ref.current;
    if (!node) return;
    const { selectionStart: start, selectionEnd: end } = node;
    const selected = node.value.slice(start, end);
    const url = window.prompt("Link address", "https://");
    if (!url) return;
    let safe: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
      safe = parsed.toString();
    } catch {
      return;
    }
    splice(start, end, `[${selected || "link"}](${safe})`);
  }

  // Mention autocomplete: watch what sits immediately before the caret.
  function detectMention() {
    const node = ref.current;
    if (!node) return;
    const upToCaret = node.value.slice(0, node.selectionStart);
    const match = /(?:^|\s)@([a-z0-9_]{0,32})$/i.exec(upToCaret);
    if (!match) {
      setMention(null);
      return;
    }
    setMention({ query: match[1] ?? "", at: node.selectionStart - (match[1]?.length ?? 0) - 1 });
    setHighlight(0);
  }

  useEffect(() => {
    if (!mention || mention.query.length < 1) return;
    const query = mention.query;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/community/mention-suggest?q=${encodeURIComponent(mention.query)}`,
          { signal: controller.signal },
        );
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
  // prefix currently being typed. Clearing it from an effect would mean one
  // render where the suggestions belong to something else.
  const people =
    mention && mention.query.length >= 1 && results.query === mention.query
      ? results.people
      : [];

  function choosePerson(person: Person) {
    const node = ref.current;
    if (!node || !mention) return;
    splice(mention.at, node.selectionStart, `@${person.handle} `);
    setMention(null);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (people.length > 0 && mention) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((current) => (current + 1) % people.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((current) => (current - 1 + people.length) % people.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choosePerson(people[highlight]!);
        return;
      }
      if (event.key === "Escape") {
        setMention(null);
        return;
      }
    }
    // Common shortcuts, so the toolbar is a hint rather than the only way.
    if (event.metaKey || event.ctrlKey) {
      if (event.key === "b") {
        event.preventDefault();
        wrap("**");
      } else if (event.key === "i") {
        event.preventDefault();
        wrap("_");
      }
    }
  }

  return (
    <div className="relative">
      <div className="mb-1.5 flex flex-wrap items-center gap-0.5">
        <Tool label="Bold" onClick={() => wrap("**")} icon={<Bold className="size-4" />} />
        <Tool label="Italic" onClick={() => wrap("_")} icon={<Italic className="size-4" />} />
        <Tool
          label="Heading"
          onClick={() => prefixLines("## ")}
          icon={<Heading2 className="size-4" />}
        />
        <Tool
          label="Bulleted list"
          onClick={() => prefixLines("- ")}
          icon={<List className="size-4" />}
        />
        <Tool
          label="Numbered list"
          onClick={() => prefixLines("1. ")}
          icon={<ListOrdered className="size-4" />}
        />
        <Tool
          label="Quote"
          onClick={() => prefixLines("> ")}
          icon={<Quote className="size-4" />}
        />
        <Tool label="Code" onClick={() => wrap("`", "`", "code")} icon={<Code className="size-4" />} />
        <Tool label="Link" onClick={insertLink} icon={<Link2 className="size-4" />} />
        <Tool
          label="Emoji"
          active={panel === "emoji"}
          onClick={() => setPanel(panel === "emoji" ? null : "emoji")}
          icon={<Smile className="size-4" />}
        />
        <Tool
          label="GIF"
          active={panel === "gif"}
          onClick={() => setPanel(panel === "gif" ? null : "gif")}
          icon={<span className="text-[11px] font-bold">GIF</span>}
        />
      </div>

      {panel === "emoji" ? (
        <div className="mb-2 grid grid-cols-6 gap-1 rounded-ctl border border-border bg-surface p-2 min-[420px]:grid-cols-8">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                const node = ref.current;
                if (!node) return;
                splice(node.selectionStart, node.selectionEnd, emoji);
                setPanel(null);
              }}
              className="grid h-9 place-items-center rounded-md text-[18px] transition hover:bg-surface-muted"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {panel === "gif" ? (
        <GifPicker
          onPick={(gif) => {
            if (onGif) {
              onGif(gif);
            } else {
              const node = ref.current;
              if (node) {
                splice(
                  node.selectionStart,
                  node.selectionEnd,
                  `
![${gif.alt.replace(/[\[\]]/g, "")}](${gif.url})
`,
                );
              }
            }
            setPanel(null);
          }}
        />
      ) : null}

      <textarea
        id={id}
        ref={ref}
        name={name}
        value={value}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          detectMention();
        }}
        onClick={detectMention}
        onKeyUp={detectMention}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setMention(null), 150)}
        className="w-full resize-y rounded-ctl border border-field-border bg-field-background p-3 text-[14.5px] leading-relaxed text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
      />

      {people.length > 0 ? (
        <ul
          role="listbox"
          aria-label="People"
          className="absolute z-30 mt-1 w-full max-w-[280px] overflow-hidden rounded-ctl border border-border bg-surface py-1 shadow-e2"
        >
          {people.map((person, index) => (
            <li key={person.handle}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choosePerson(person);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition",
                  index === highlight
                    ? "bg-surface-muted text-foreground"
                    : "text-foreground-muted hover:text-foreground",
                )}
              >
                <span className="font-semibold text-foreground">{person.name}</span>
                <span className="text-foreground-muted">@{person.handle}</span>
              </button>
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
  active = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-9 place-items-center rounded-md transition",
        active
          ? "bg-brand-fill text-brand-fill-foreground"
          : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}

/**
 * GIF search.
 *
 * Hides itself entirely when no Tenor key is configured, rather than showing a
 * search box that returns nothing forever. A control that cannot work should
 * not be on screen.
 */
function GifPicker({ onPick }: { onPick: (gif: GifChoice) => void }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<
    { id: string; url: string; previewUrl: string; alt: string; width: number | null; height: number | null }[]
  >([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/community/gifs?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as {
          configured?: boolean;
          gifs?: typeof gifs;
        };
        setConfigured(data.configured ?? false);
        setGifs(data.gifs ?? []);
      } catch {
        // Leave whatever was there; the search box still works.
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (configured === false) {
    return (
      <p className="mb-2 rounded-ctl border border-border bg-surface px-3 py-2 text-[12.5px] text-foreground-muted">
        GIF search is not set up yet. You can still upload one as an image.
      </p>
    );
  }

  return (
    <div className="mb-2 rounded-ctl border border-border bg-surface p-2">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search GIFs"
        aria-label="Search GIFs"
        className="h-10 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[13.5px] text-foreground outline-none focus:border-brand"
      />
      <div className="mt-2 grid max-h-56 grid-cols-3 gap-1 overflow-y-auto">
        {gifs.map((gif) => (
          <button
            key={gif.id}
            type="button"
            onClick={() =>
              onPick({
                url: gif.url,
                alt: gif.alt,
                width: gif.width,
                height: gif.height,
              })
            }
            className="overflow-hidden rounded-md border border-border"
          >
            {/* Remote GIF thumbnails from Tenor's CDN; the optimizer would
                strip the animation. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gif.previewUrl}
              alt={gif.alt}
              loading="lazy"
              className="h-20 w-full object-cover"
            />
          </button>
        ))}
      </div>
      {loading ? (
        <p className="mt-1 text-[12px] text-foreground-muted">Searching…</p>
      ) : gifs.length === 0 && query ? (
        <p className="mt-1 text-[12px] text-foreground-muted">Nothing found.</p>
      ) : null}
    </div>
  );
}
