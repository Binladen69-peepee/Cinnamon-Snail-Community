"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  Compass,
  CornerDownLeft,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import type { PaletteGroup } from "@/app/api/search/route";
import {
  filterSuggestions,
  NAV_SECTION_SUGGESTIONS,
  type SearchSuggestion,
} from "@/lib/search/suggest";
import { cn } from "@/lib/utils";

type Row = SearchSuggestion;

const GROUP_ICON = {
  "Live classes": Calendar,
  Classes: BookOpen,
  Sections: Compass,
  Members: Users,
  Posts: Search,
  Courses: BookOpen,
  Lessons: BookOpen,
  Events: Calendar,
  Comments: Search,
  Results: Search,
} as const;

/**
 * Navbar search: a real field with a transparent ground, a visible border,
 * and a dropdown of suggestions (live classes, sections, then index hits).
 *
 * It used to be a cream pill that opened a full-screen overlay. The field
 * itself is now the input, so autosuggest sits under it the way people expect.
 */
export function CommandPalette({
  suggestions = NAV_SECTION_SUGGESTIONS,
}: {
  suggestions?: SearchSuggestion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; groups: PaletteGroup[] } | null>(
    null,
  );
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        return;
      }
      if (event.key === "/" && !meta && !event.altKey) {
        const active = document.activeElement;
        const typing =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable);
        if (typing) return;
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResult(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
        .then((data: { groups: PaletteGroup[] }) => {
          if (alive) setResult({ q, groups: data.groups });
        })
        .catch(() => {
          if (alive) setResult({ q, groups: [] });
        });
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;
  const groups = result && result.q === trimmed ? result.groups : null;
  const loading = searching && groups === null;

  const local = filterSuggestions(suggestions, trimmed, searching ? 6 : 8);
  const remote: Row[] =
    searching && groups
      ? groups.flatMap((group) =>
          group.hits.map((hit) => ({
            label: hit.title,
            href: hit.href,
            group: group.label,
            snippet: hit.snippet,
          })),
        )
      : [];

  const seen = new Set(local.map((row) => row.href));
  const rows: Row[] = [
    ...local,
    ...remote.filter((row) => {
      if (seen.has(row.href)) return false;
      seen.add(row.href);
      return true;
    }),
  ].slice(0, 10);

  useEffect(() => {
    setCursor(0);
  }, [trimmed, rows.length]);

  function go(row: Row | undefined) {
    if (!row) return;
    setOpen(false);
    setQuery("");
    router.push(row.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setCursor((c) => (rows.length ? (c + 1) % rows.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (rows[cursor]) {
        go(rows[cursor]);
      } else if (searching) {
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="sr-only" htmlFor="vu-nav-search">
        Search
      </label>
      <div className="vu-nav-search-shell">
        <Search className="vu-nav-search-icon" aria-hidden />
        <input
          id="vu-nav-search"
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[cursor] ? `${listId}-${cursor}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search classes, members, pages…"
          className="vu-nav-search"
        />
        {loading ? (
          <Loader2 className="vu-nav-search-status animate-spin" aria-hidden />
        ) : null}
      </div>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="vu-nav-suggest"
        >
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-foreground-muted">
              {loading
                ? "Searching…"
                : searching
                  ? `Nothing matches “${trimmed}”. Press Enter to search everything.`
                  : "Try a class name, a member, or a section."}
            </p>
          ) : (
            rows.map((row, index) => {
              const Icon =
                GROUP_ICON[row.group as keyof typeof GROUP_ICON] ?? Search;
              return (
                <button
                  key={`${row.href}-${row.label}-${index}`}
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => go(row)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition",
                    index === cursor ? "bg-brand-wash" : "hover:bg-mint/60",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      index === cursor ? "text-brand" : "text-foreground-muted",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[14px] font-semibold",
                        index === cursor ? "text-brand-strong" : "text-foreground",
                      )}
                    >
                      {row.label}
                    </span>
                    <span className="block truncate text-[12px] text-foreground-muted">
                      {row.snippet || row.group}
                    </span>
                  </span>
                  {index === cursor ? (
                    <CornerDownLeft
                      className="size-3.5 shrink-0 text-brand"
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
