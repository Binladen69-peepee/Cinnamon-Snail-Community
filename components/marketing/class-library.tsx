"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { MediaFrame } from "@/components/ui/media-frame";
import {
  CLASS_LIBRARY,
  classesOnShelf,
  libraryShelves,
  playingEmbedSrc,
  resolveClassPhoto,
  type LibraryClass,
  type ShelfName,
} from "@/lib/marketing/class-library";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, iframe, [tabindex]:not([tabindex="-1"])';

export function ClassLibrary() {
  const shelves = libraryShelves();
  const [shelf, setShelf] = useState<ShelfName | null>(null);
  const [open, setOpen] = useState<LibraryClass | null>(null);
  const visible = useMemo(() => classesOnShelf(shelf), [shelf]);

  return (
    <div>
      <CategoryNav
        shelves={shelves.map((row) => ({
          name: row.name,
          count: row.classes.length,
        }))}
        active={shelf}
        onChange={setShelf}
      />
      <ClassSlider
        key={shelf ?? "all"}
        classes={visible}
        onOpen={setOpen}
      />
      {open ? (
        <ClassViewer
          current={open}
          classes={visible}
          onSelect={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function CategoryNav({
  shelves,
  active,
  onChange,
}: {
  shelves: Array<{ name: ShelfName; count: number }>;
  active: ShelfName | null;
  onChange: (shelf: ShelfName | null) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Class shelves"
      className="flex flex-wrap gap-x-5 gap-y-2 border-b border-sand"
    >
      <CategoryTab selected={active === null} onClick={() => onChange(null)}>
        All classes
      </CategoryTab>
      {shelves.map((row) => (
        <CategoryTab
          key={row.name}
          selected={active === row.name}
          onClick={() => onChange(row.name)}
        >
          {row.name}
        </CategoryTab>
      ))}
    </div>
  );
}

function CategoryTab({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "-mb-px shrink-0 border-b-2 pb-3 text-sm transition-colors duration-300",
        selected
          ? "border-accent font-semibold text-forest"
          : "border-transparent text-foreground-muted hover:text-forest",
      )}
    >
      {children}
    </button>
  );
}

function ClassSlider({
  classes,
  onOpen,
}: {
  classes: LibraryClass[];
  onOpen: (cls: LibraryClass) => void;
}) {
  const railRef = useRef<HTMLUListElement>(null);

  function nudge(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.85, behavior: "smooth" });
  }

  if (classes.length === 0) {
    return (
      <p className="mt-10 text-sm text-foreground-muted">
        No classes on this shelf.
      </p>
    );
  }

  return (
    <div className="relative mt-8">
      <div className="mb-3 hidden justify-end gap-2 md:flex">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Scroll classes left"
          className="grid size-9 place-items-center rounded-full border border-sand bg-surface text-forest transition hover:border-accent"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Scroll classes right"
          className="grid size-9 place-items-center rounded-full border border-sand bg-surface text-forest transition hover:border-accent"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <ul
        ref={railRef}
        className="vu-rail flex gap-4 overflow-x-auto pb-2"
        tabIndex={0}
        aria-label="Class slider"
      >
        {classes.map((cls, index) => (
          <li key={cls.slug} className="w-[16.5rem] shrink-0">
            <ClassCard
              cls={cls}
              eager={index < 4}
              onOpen={() => onOpen(cls)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClassCard({
  cls,
  eager,
  onOpen,
}: {
  cls: LibraryClass;
  eager?: boolean;
  onOpen: () => void;
}) {
  return (
    <article className="group vu-lift flex h-full flex-col">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full flex-col bg-transparent p-0 text-left"
        aria-haspopup="dialog"
      >
        <ClassPhoto cls={cls} eager={eager} showPlay />
        <span className="mt-3 line-clamp-2 min-h-[2.6rem] font-display text-base font-bold leading-snug text-forest">
          {cls.title}
        </span>
      </button>
    </article>
  );
}

function ClassPhoto({
  cls,
  eager,
  showPlay = false,
  compact = false,
}: {
  cls: LibraryClass;
  eager?: boolean;
  showPlay?: boolean;
  compact?: boolean;
}) {
  const photo = resolveClassPhoto(cls.thumbnailUrl);

  return (
    <span
      className={cn(
        "relative block overflow-hidden bg-mint",
        compact ? "aspect-square w-12 shrink-0 rounded-lg" : "aspect-[4/3] rounded-[1.25rem]",
      )}
    >
      {photo ? (
        <MediaFrame
          src={photo}
          alt=""
          aspect="absolute inset-0 size-full"
          rounded="rounded-none"
          reveal={false}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
        />
      ) : (
        <span className="flex size-full items-end px-3 py-2">
          <span className="text-[10px] font-semibold tracking-wide text-olive">
            Photo coming soon
          </span>
        </span>
      )}
      {showPlay && cls.teaserUrl ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-forest/20 opacity-0 transition duration-300 group-hover:opacity-100">
          <span className="grid size-11 place-items-center rounded-full bg-white/95 text-forest">
            <Play className="size-4 translate-x-px" aria-hidden />
          </span>
        </span>
      ) : null}
    </span>
  );
}

function ClassViewer({
  current,
  classes,
  onSelect,
  onClose,
}: {
  current: LibraryClass;
  classes: LibraryClass[];
  onSelect: (cls: LibraryClass) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const list = classes.length > 0 ? classes : CLASS_LIBRARY;

  const trap = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => !node.hasAttribute("disabled"),
      );
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [trap]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-forest/55"
        aria-label="Close class video"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 grid max-h-[min(44rem,90vh)] w-full max-w-5xl overflow-hidden rounded-[1.25rem] border border-sand bg-surface shadow-[var(--overlay-shadow)] lg:grid-cols-[minmax(0,1fr)_17.5rem]"
      >
        <div className="min-w-0">
          <div className="relative flex items-start justify-between gap-4 px-5 pb-3 pt-5">
            <h3
              id={titleId}
              className="font-display pr-10 text-xl leading-snug text-forest md:text-2xl"
            >
              {current.title}
            </h3>
            <button
              ref={closeRef}
              type="button"
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-sand bg-surface text-forest hover:border-accent"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="px-5 pb-5">
            <div className="relative aspect-video overflow-hidden rounded-[1rem] bg-forest">
              {current.teaserUrl ? (
                <iframe
                  key={current.teaserUrl}
                  src={playingEmbedSrc(current.teaserUrl)}
                  title={`Teaser for ${current.title}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 size-full border-0"
                />
              ) : (
                <p className="grid size-full place-items-center text-sm text-paper">
                  No teaser in the sheet for this class.
                </p>
              )}
            </div>
          </div>
        </div>
        <aside className="flex max-h-56 min-h-0 flex-col border-t border-sand bg-mint/40 lg:max-h-none lg:border-l lg:border-t-0">
          <p className="px-4 pb-2 pt-4 text-xs font-semibold text-olive">
            More classes
          </p>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
            {list.map((cls) => {
              const selected = cls.slug === current.slug;
              return (
                <li key={cls.slug}>
                  <button
                    type="button"
                    onClick={() => onSelect(cls)}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[0.85rem] p-2 text-left transition",
                      selected
                        ? "bg-surface shadow-[inset_0_0_0_1px_var(--accent)]"
                        : "hover:bg-surface/80",
                    )}
                  >
                    <ClassPhoto cls={cls} compact />
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-forest">
                      {cls.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
