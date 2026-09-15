"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  Cookie,
  Globe,
  LayoutGrid,
  Leaf,
  Play,
  Search,
  Soup,
  Sparkles,
  Star,
  User,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { MediaFrame } from "@/components/ui/media-frame";
import {
  CLASS_LIBRARY,
  classDetailHref,
  featuredPool,
  filterLibrary,
  libraryShelves,
  playingEmbedSrc,
  resolveClassPhoto,
  shelfForTitle,
  type LibraryClass,
  type ShelfName,
} from "@/lib/marketing/class-library";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, iframe, [tabindex]:not([tabindex="-1"])';

const INSTRUCTOR = "Adam Sobel";

const SHELF_ICON: Record<ShelfName, ComponentType<{ className?: string }>> = {
  "Regional & World Cuisine": Globe,
  "Holidays & Seasonal": CalendarDays,
  "Techniques & Substitutes": Sparkles,
  "Baking & Desserts": Cookie,
  "Weeknights & Comfort": Soup,
};

export function ClassLibrary() {
  const shelves = libraryShelves();
  const [shelf, setShelf] = useState<ShelfName | null>(null);
  const [query, setQuery] = useState("");
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [open, setOpen] = useState<LibraryClass | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [allCategories, setAllCategories] = useState(false);

  const visible = useMemo(() => filterLibrary(shelf, query), [shelf, query]);
  const pool = useMemo(() => featuredPool(visible), [visible]);
  const safeFeaturedIndex =
    pool.length === 0 ? 0 : Math.min(featuredIndex, pool.length - 1);
  const featured = pool[safeFeaturedIndex] ?? visible[0] ?? null;
  const popular = visible
    .filter((cls) => cls.slug !== featured?.slug)
    .slice(0, 4);
  const shownShelves = allCategories ? shelves : shelves.slice(0, 3);

  function selectShelf(next: ShelfName | null) {
    setShelf(next);
    setFeaturedIndex(0);
    setShowAll(false);
  }

  function cycle(direction: -1 | 1) {
    if (pool.length === 0) return;
    setFeaturedIndex((index) => (index + direction + pool.length) % pool.length);
  }

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <CategoryNav
          shelves={shelves}
          active={shelf}
          onChange={selectShelf}
        />
        <label className="relative block w-full shrink-0 lg:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-olive" aria-hidden />
          <span className="sr-only">Search classes</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setFeaturedIndex(0);
              setShowAll(false);
            }}
            placeholder="Search classes..."
            className="h-11 w-full rounded-full border border-sand bg-surface pl-10 pr-4 text-sm text-forest outline-none placeholder:text-olive focus-visible:border-accent"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="mt-10 text-sm text-foreground-muted">
          No classes match that search.
        </p>
      ) : (
        <>
          <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5">
              {featured ? (
                <FeaturedCard
                  cls={featured}
                  index={safeFeaturedIndex}
                  total={pool.length}
                  onOpen={() => setOpen(featured)}
                  onPrev={() => cycle(-1)}
                  onNext={() => cycle(1)}
                  onDot={setFeaturedIndex}
                />
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col lg:col-span-4">
              <div className="mb-4 flex items-end justify-between gap-3">
                <h3 className="font-display text-2xl text-forest">Popular This Week</h3>
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-olive transition hover:text-forest"
                >
                  View all
                  <ArrowRight className="size-3.5" aria-hidden />
                </button>
              </div>
              <ul className="grid grid-cols-2 gap-3">
                {popular.map((cls) => (
                  <li key={cls.slug}>
                    <PopularCard cls={cls} onOpen={() => setOpen(cls)} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex min-w-0 flex-col lg:col-span-3">
              <h3 className="font-display text-2xl text-forest">Explore by Category</h3>
              <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
                Find the perfect class for your mood, season, or skill level.
              </p>
              <ul className="mt-4 space-y-3">
                {shownShelves.map((row) => (
                  <li key={row.name}>
                    <CategoryCard
                      name={row.name}
                      count={row.classes.length}
                      cover={row.classes[0]?.thumbnailUrl ?? null}
                      onClick={() => selectShelf(row.name)}
                    />
                  </li>
                ))}
              </ul>
              {shelves.length > 3 && !allCategories ? (
                <button
                  type="button"
                  onClick={() => setAllCategories(true)}
                  className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-olive transition hover:text-forest"
                >
                  View all categories
                  <ArrowRight className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>

          {showAll ? (
            <ClassSlider
              classes={visible}
              onOpen={setOpen}
            />
          ) : null}
        </>
      )}

      {open ? (
        <ClassViewer
          current={open}
          classes={visible.length > 0 ? visible : CLASS_LIBRARY}
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
  shelves: ReturnType<typeof libraryShelves>;
  active: ShelfName | null;
  onChange: (shelf: ShelfName | null) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Class shelves"
      className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
    >
      <CategoryTab
        selected={active === null}
        icon={LayoutGrid}
        onClick={() => onChange(null)}
      >
        All Classes
      </CategoryTab>
      {shelves.map((row) => {
        const Icon = SHELF_ICON[row.name];
        return (
          <CategoryTab
            key={row.name}
            selected={active === row.name}
            icon={Icon}
            onClick={() => onChange(row.name)}
          >
            {row.name}
          </CategoryTab>
        );
      })}
    </div>
  );
}

function CategoryTab({
  selected,
  icon: Icon,
  onClick,
  children,
}: {
  selected: boolean;
  icon: ComponentType<{ className?: string }>;
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
        "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition",
        selected
          ? "bg-sage text-forest"
          : "bg-transparent text-olive hover:bg-mint hover:text-forest",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </button>
  );
}

function FeaturedCard({
  cls,
  index,
  total,
  onOpen,
  onPrev,
  onNext,
  onDot,
}: {
  cls: LibraryClass;
  index: number;
  total: number;
  onOpen: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDot: (index: number) => void;
}) {
  const photo = resolveClassPhoto(cls.thumbnailUrl);
  const shelf = shelfForTitle(cls.title);

  return (
    <article className="relative isolate min-h-[28rem] overflow-hidden rounded-[1.75rem] bg-forest lg:min-h-[32rem]">
      {photo ? (
        <MediaFrame
          src={photo}
          alt=""
          aspect="absolute inset-0 size-full"
          rounded="rounded-none"
          reveal={false}
          loading="eager"
          fetchPriority="high"
        />
      ) : (
        <div className="absolute inset-0 bg-mint" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/55 to-forest/10" />
      <div className="relative flex h-full min-h-[28rem] flex-col justify-end p-6 lg:min-h-[32rem] lg:p-8">
        <p className="inline-flex w-fit items-center rounded-full bg-sage/90 px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-forest">
          Featured class
        </p>
        <p className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-terracotta">
          {shelf}
        </p>
        <h3 className="font-display mt-2 max-w-[16ch] text-3xl leading-tight text-paper md:text-4xl">
          {cls.title}
        </h3>
        <button
          type="button"
          onClick={onOpen}
          className="vu-cta-fill mt-6 inline-flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
        >
          View class
          <ArrowRight className="size-4" aria-hidden />
        </button>
        {total > 1 ? (
          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous featured class"
              className="grid size-8 place-items-center rounded-full border border-paper/30 text-paper"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <div className="flex gap-1.5">
              {Array.from({ length: total }, (_, dot) => (
                <button
                  key={dot}
                  type="button"
                  aria-label={`Show featured class ${dot + 1}`}
                  onClick={() => onDot(dot)}
                  className={cn(
                    "size-1.5 rounded-full",
                    dot === index ? "bg-paper" : "bg-paper/35",
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next featured class"
              className="grid size-8 place-items-center rounded-full border border-paper/30 text-paper"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PopularCard({
  cls,
  onOpen,
}: {
  cls: LibraryClass;
  onOpen: () => void;
}) {
  const photo = resolveClassPhoto(cls.thumbnailUrl);
  const shelf = shelfForTitle(cls.title);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col overflow-hidden rounded-[1.25rem] bg-surface text-left shadow-[var(--surface-shadow)] ring-1 ring-sand"
    >
      <span className="relative block aspect-[16/10] overflow-hidden bg-mint">
        {photo ? (
          <MediaFrame
            src={photo}
            alt=""
            aspect="absolute inset-0 size-full"
            rounded="rounded-none"
            reveal={false}
          />
        ) : (
          <span className="flex size-full items-end px-3 py-2 text-[10px] font-semibold text-olive">
            Photo coming soon
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col p-3">
        <span className="text-[10px] font-semibold tracking-[0.16em] text-terracotta">
          {shelf}
        </span>
        <span className="font-display mt-1 line-clamp-2 text-sm leading-snug text-forest">
          {cls.title}
        </span>
      </span>
    </button>
  );
}

function CategoryCard({
  name,
  count,
  cover,
  onClick,
}: {
  name: ShelfName;
  count: number;
  cover: string | null;
  onClick: () => void;
}) {
  const photo = resolveClassPhoto(cover);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex min-h-[5.5rem] w-full overflow-hidden rounded-[1.25rem] text-left"
    >
      {photo ? (
        <MediaFrame
          src={photo}
          alt=""
          aspect="absolute inset-0 size-full"
          rounded="rounded-none"
          reveal={false}
        />
      ) : (
        <span className="absolute inset-0 bg-mint" />
      )}
      <span className="absolute inset-0 bg-forest/55" />
      <span className="relative flex w-full items-end justify-between gap-3 p-4">
        <span>
          <span className="block font-display text-lg leading-tight text-paper">
            {name}
          </span>
          <span className="mt-0.5 block text-xs text-paper/80">
            {count} {count === 1 ? "class" : "classes"}
          </span>
        </span>
        <ArrowRight className="size-4 text-paper" aria-hidden />
      </span>
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

  return (
    <div className="relative mt-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h3 className="font-display text-2xl text-forest">All in this shelf</h3>
        <div className="hidden gap-2 md:flex">
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
      </div>
      <ul
        ref={railRef}
        className="vu-rail flex gap-4 overflow-x-auto pb-2"
        tabIndex={0}
        aria-label="Class slider"
      >
        {classes.map((cls) => (
          <li key={cls.slug} className="w-[16.5rem] shrink-0">
            <PopularCard cls={cls} onOpen={() => onOpen(cls)} />
          </li>
        ))}
      </ul>
    </div>
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
  const shelf = shelfForTitle(current.title);

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
    <div className="fixed inset-0 z-50 grid place-items-center p-3 md:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-forest/60"
        aria-label="Close class video"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 grid max-h-[min(46rem,92vh)] w-full max-w-6xl overflow-hidden rounded-[1.75rem] shadow-[var(--overlay-shadow)] lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="min-w-0 overflow-y-auto bg-forest text-paper">
          <div className="px-6 pb-3 pt-6 md:px-8 md:pt-8">
            <p className="text-[11px] font-bold tracking-[0.22em] text-terracotta">
              Vegan University
            </p>
            <h3
              id={titleId}
              className="font-display mt-2 text-2xl leading-tight md:text-3xl"
            >
              {current.title}
            </h3>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-paper/80">
              <span className="inline-flex items-center gap-1.5">
                <User className="size-3.5" aria-hidden />
                {INSTRUCTOR}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Leaf className="size-3.5" aria-hidden />
                {shelf}
              </span>
            </p>
          </div>
          <div className="px-6 md:px-8">
            <div className="relative aspect-video overflow-hidden rounded-[1.1rem] bg-ink">
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
                <p className="grid size-full place-items-center text-sm">
                  No teaser in the sheet for this class.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-6 md:px-8">
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-paper/80">
              <li className="inline-flex items-center gap-1.5">
                <Leaf className="size-3.5" aria-hidden />
                100% Plant-Based
              </li>
              <li className="inline-flex items-center gap-1.5">
                <ChefHat className="size-3.5" aria-hidden />
                Expert Instruction
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Star className="size-3.5" aria-hidden />
                Beginner Friendly
              </li>
            </ul>
            <Link
              href={classDetailHref(current.slug)}
              className="inline-flex items-center gap-2 rounded-full bg-sage px-5 py-2.5 text-sm font-semibold text-forest no-underline"
            >
              View Class Details
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        <aside className="flex max-h-64 min-h-0 flex-col bg-cream lg:max-h-none">
          <div className="flex items-center justify-between px-4 pb-2 pt-5">
            <p className="font-display text-xl text-forest">More classes</p>
            <button
              ref={closeRef}
              type="button"
              className="grid size-8 place-items-center rounded-full text-olive hover:bg-mint hover:text-forest"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
            {classes.map((cls) => {
              const selected = cls.slug === current.slug;
              return (
                <li key={cls.slug}>
                  <button
                    type="button"
                    onClick={() => onSelect(cls)}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl p-2 text-left transition",
                      selected ? "bg-sage" : "hover:bg-mint",
                    )}
                  >
                    <ClassThumb cls={cls} />
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 text-sm font-semibold leading-snug text-forest">
                        {cls.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-olive">
                        {shelfForTitle(cls.title)}
                      </span>
                    </span>
                    {selected ? (
                      <Play className="size-4 shrink-0 text-forest" aria-hidden />
                    ) : null}
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

function ClassThumb({ cls }: { cls: LibraryClass }) {
  const photo = resolveClassPhoto(cls.thumbnailUrl);
  return (
    <span className="relative block size-12 shrink-0 overflow-hidden rounded-xl bg-mint">
      {photo ? (
        <MediaFrame
          src={photo}
          alt=""
          aspect="absolute inset-0 size-full"
          rounded="rounded-none"
          reveal={false}
          hover={false}
        />
      ) : null}
    </span>
  );
}
