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
  Clock,
  Cookie,
  Globe,
  LayoutGrid,
  Leaf,
  Play,
  Soup,
  Sparkles,
  Star,
  User,
  Video,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { MediaFrame } from "@/components/ui/media-frame";
import {
  CLASS_LIBRARY,
  classDetailHref,
  classesOnShelf,
  featuredPool,
  formatClassLength,
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
const ROTATE_MS = 5200;

const SHELF_ICON: Record<ShelfName, ComponentType<{ className?: string }>> = {
  "Regional & World Cuisine": Globe,
  "Holidays & Seasonal": CalendarDays,
  "Techniques & Substitutes": Sparkles,
  "Baking & Desserts": Cookie,
  "Weeknights & Comfort": Soup,
};

export function ClassLibrary() {
  const allPool = useMemo(() => featuredPool(CLASS_LIBRARY), []);
  const popular = useMemo(
    () =>
      CLASS_LIBRARY.filter(
        (cls) => !allPool.some((item) => item.slug === cls.slug),
      ).slice(0, 4),
    [allPool],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState<LibraryClass | null>(null);
  const [popupShelf, setPopupShelf] = useState<ShelfName | null>(null);
  const pauseRef = useRef(false);

  const rotateCount = allPool.length;
  const safeIndex =
    rotateCount === 0 ? 0 : Math.min(activeIndex, rotateCount - 1);
  const featured = allPool[safeIndex] ?? null;

  function cycle(direction: -1 | 1) {
    if (rotateCount === 0) return;
    setActiveIndex((index) => (index + direction + rotateCount) % rotateCount);
  }

  function openClass(cls: LibraryClass, shelf: ShelfName | null = null) {
    setPopupShelf(shelf);
    setOpen(cls);
  }

  useEffect(() => {
    if (open || rotateCount < 2) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const timer = window.setInterval(() => {
      if (pauseRef.current) return;
      setActiveIndex((index) => (index + 1) % rotateCount);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [open, rotateCount]);

  return (
    <div
      onMouseEnter={() => {
        pauseRef.current = true;
      }}
      onMouseLeave={() => {
        pauseRef.current = false;
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (featured) openClass(featured, null);
          }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-normal text-foreground transition hover:border-foreground"
        >
          <LayoutGrid className="size-4" aria-hidden />
          Browse categories
        </button>
      </div>

      <div className="mt-8 grid items-stretch gap-5 lg:grid-cols-2">
        {featured ? (
          <FeaturedCard
            cls={featured}
            index={safeIndex}
            total={allPool.length}
            onOpen={() => openClass(featured)}
            onPrev={() => cycle(-1)}
            onNext={() => cycle(1)}
            onDot={setActiveIndex}
          />
        ) : null}
        <div className="flex min-w-0 flex-col">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h3 className="font-display text-2xl text-foreground">
              Popular This Week
            </h3>
          </div>
          <ul className="grid flex-1 grid-cols-2 gap-3">
            {popular.map((cls) => (
              <li key={cls.slug} className="min-h-0">
                <LibraryCard cls={cls} onOpen={() => openClass(cls)} compact />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {open ? (
        <ClassViewer
          current={open}
          shelf={popupShelf}
          onShelf={setPopupShelf}
          onSelect={setOpen}
          onClose={() => {
            setOpen(null);
            setPopupShelf(null);
          }}
        />
      ) : null}
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
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-normal transition",
        selected
          ? "border-foreground bg-sage text-foreground"
          : "border-border bg-transparent text-olive hover:border-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
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
  return (
    <article className="relative isolate aspect-[4/5] max-h-[22rem] overflow-hidden rounded-[1.75rem] bg-surface sm:max-h-[24rem] lg:aspect-auto lg:h-full lg:max-h-none lg:min-h-[22rem]">
      <div key={cls.slug} className="vu-copy-fade absolute inset-0">
        <ClassPhoto url={cls.thumbnailUrl} eager />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
      <div className="absolute inset-0 z-10 flex flex-col justify-end p-5 lg:p-7">
        <div key={`copy-${cls.slug}`} className="vu-copy-fade">
          <p className="inline-flex w-fit items-center rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-white backdrop-blur-sm">
            Featured class
          </p>
          <ClassMeta cls={cls} onPhoto className="mt-5" />
          <h3 className="font-display vu-on-media mt-2 max-w-[18ch] text-3xl leading-tight text-white md:text-4xl">
            {cls.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          View class
          <ArrowRight className="size-4" aria-hidden />
        </button>
        {total > 1 ? (
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous featured class"
              className="grid size-8 place-items-center rounded-full border border-white/35 text-white"
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
                    dot === index ? "bg-white" : "bg-white/35",
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next featured class"
              className="grid size-8 place-items-center rounded-full border border-white/35 text-white"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function LibraryCard({
  cls,
  onOpen,
  compact = false,
}: {
  cls: LibraryClass;
  onOpen: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col overflow-hidden rounded-[1.25rem] border border-border bg-surface text-left transition hover:border-foreground/50"
    >
      <span
        className={cn(
          "relative block overflow-hidden bg-mint",
          compact ? "aspect-[16/10]" : "aspect-[16/9]",
        )}
      >
        <ClassPhoto url={cls.thumbnailUrl} />
      </span>
      <span className="flex flex-1 flex-col p-3">
        <ClassMeta cls={cls} />
        <span className="font-display mt-1 line-clamp-2 text-sm leading-snug text-foreground">
          {cls.title}
        </span>
      </span>
    </button>
  );
}

function ClassMeta({
  cls,
  onPhoto = false,
  className,
}: {
  cls: LibraryClass;
  onPhoto?: boolean;
  className?: string;
}) {
  const shelf = shelfForTitle(cls.title);
  const length = formatClassLength(cls.durationSeconds);

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold tracking-[0.04em]",
        onPhoto ? "text-white/90" : "text-olive",
        className,
      )}
    >
      {length ? (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" aria-hidden />
          {length}
        </span>
      ) : null}
      <span>{shelf}</span>
    </p>
  );
}

function ClassPhoto({
  url,
  eager = false,
}: {
  url: string;
  eager?: boolean;
}) {
  const photo = resolveClassPhoto(url);

  if (!photo) {
    return <span className="absolute inset-0 bg-mint" />;
  }

  return (
    <span className="absolute inset-0">
      <MediaFrame
        src={photo}
        alt=""
        aspect="size-full"
        className="size-full"
        rounded="rounded-none"
        reveal={false}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
      />
    </span>
  );
}

function ClassViewer({
  current,
  shelf,
  onShelf,
  onSelect,
  onClose,
}: {
  current: LibraryClass;
  shelf: ShelfName | null;
  onShelf: (shelf: ShelfName | null) => void;
  onSelect: (cls: LibraryClass) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const shelves = libraryShelves();
  const visible = classesOnShelf(shelf);
  const currentShelf = shelfForTitle(current.title);
  const length = formatClassLength(current.durationSeconds);
  const playingInFilter = visible.some((cls) => cls.slug === current.slug);

  function selectShelf(next: ShelfName | null) {
    onShelf(next);
    const nextClasses = classesOnShelf(next);
    if (
      nextClasses.length > 0 &&
      !nextClasses.some((cls) => cls.slug === current.slug)
    ) {
      onSelect(nextClasses[0]!);
    }
  }

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

  useEffect(() => {
    const selected = listRef.current?.querySelector("[aria-current='true']");
    selected?.scrollIntoView({ block: "nearest" });
  }, [current.slug, shelf]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 md:p-6">
      <button
        type="button"
        className="vu-dialog-veil absolute inset-0 bg-black/60"
        aria-label="Close class video"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="vu-dialog-in relative z-10 grid h-[min(88vh,56rem)] w-[70%] max-w-none grid-rows-[minmax(0,1fr)_minmax(14rem,42%)] overflow-hidden rounded-[1.75rem] border border-border shadow-[var(--overlay-shadow)] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-none"
      >
        <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto bg-ink text-background dark:bg-black">
          <div key={current.slug} className="vu-copy-fade px-6 pb-3 pt-6 md:px-8 md:pt-8">
            <p className="text-[11px] font-bold tracking-[0.22em] text-terracotta">
              Vegan University
            </p>
            <h3
              id={titleId}
              className="font-display mt-2 text-2xl leading-tight md:text-3xl"
            >
              {current.title}
            </h3>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
              <span className="inline-flex items-center gap-1.5">
                <User className="size-3.5" aria-hidden />
                {INSTRUCTOR}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Leaf className="size-3.5" aria-hidden />
                {currentShelf}
              </span>
              {length ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" aria-hidden />
                  {length}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Video className="size-3.5" aria-hidden />
                Class teaser
              </span>
            </p>
          </div>
          <div className="px-6 md:px-8">
            <div className="relative aspect-video overflow-hidden rounded-[12px] bg-black">
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
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/80">
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
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black no-underline"
            >
              View Class Details
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col overflow-hidden border-t border-border bg-surface lg:border-l lg:border-t-0">
          <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-5">
            <p className="font-display text-xl text-foreground">Class details</p>
            <button
              ref={closeRef}
              type="button"
              className="grid size-8 place-items-center rounded-full text-olive hover:bg-mint hover:text-foreground"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Class shelves"
            className="flex shrink-0 flex-wrap gap-2 px-4 pb-3"
          >
            <CategoryTab
              selected={shelf === null}
              icon={LayoutGrid}
              onClick={() => selectShelf(null)}
            >
              All Classes
            </CategoryTab>
            {shelves.map((row) => {
              const Icon = SHELF_ICON[row.name];
              return (
                <CategoryTab
                  key={row.name}
                  selected={shelf === row.name}
                  icon={Icon}
                  onClick={() => selectShelf(row.name)}
                >
                  {row.name}
                </CategoryTab>
              );
            })}
          </div>

          <p className="shrink-0 px-4 pb-1 text-[11px] font-normal tracking-[0.14em] text-olive">
            {shelf ? shelf : "All classes"} · {visible.length}
          </p>
          <ul
            ref={listRef}
            key={shelf ?? "all"}
            className="vu-copy-fade min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-4"
          >
            {visible.map((cls) => {
              const selected =
                playingInFilter && cls.slug === current.slug;
              const itemLength = formatClassLength(cls.durationSeconds);
              return (
                <li key={cls.slug}>
                  <button
                    type="button"
                    onClick={() => onSelect(cls)}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 p-2 text-left transition",
                      selected ? "rounded-[12px] bg-sage" : "rounded-2xl hover:bg-mint",
                    )}
                  >
                    <span className="relative block size-12 shrink-0 overflow-hidden rounded-[12px] bg-mint">
                      <ClassThumb cls={cls} />
                      {selected ? (
                        <span className="absolute inset-0 grid place-items-center bg-black/55">
                          <span className="flex flex-col items-center gap-0.5 text-white">
                            <Play className="size-4 fill-white" aria-hidden />
                            <span className="text-[8px] font-normal uppercase tracking-[0.12em]">
                              Playing
                            </span>
                          </span>
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 text-sm font-normal leading-snug text-foreground">
                        {cls.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] font-normal text-olive">
                        <span>{shelfForTitle(cls.title)}</span>
                        {itemLength ? <span>{itemLength}</span> : null}
                      </span>
                    </span>
                    <Video
                      className={cn(
                        "size-4 shrink-0",
                        selected ? "text-foreground" : "text-olive",
                      )}
                      aria-hidden
                    />
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
  return <ClassPhoto url={cls.thumbnailUrl} />;
}
