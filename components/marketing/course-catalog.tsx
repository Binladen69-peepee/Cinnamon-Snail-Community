"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/utils";

export type CatalogCardView = {
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  teaserVideoUrl: string | null;
  liveAt: string | null;
};

export type CatalogRowView = {
  category: string;
  courses: CatalogCardView[];
};

/**
 * Netflix-style catalog: a category title with cards scrolling sideways, more
 * than fits on screen. Each row ends with an "and many more" card, because this
 * is a sample of a much bigger library.
 */
export function CourseCatalog({ rows }: { rows: CatalogRowView[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-sand px-6 py-10 text-center text-sm text-foreground-muted">
        The class catalog loads from the live course data. Once classes are
        published with a category, the rows appear here.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {rows.map((row, index) => (
        <Reveal key={row.category} delay={index * 60}>
          <CatalogRail row={row} />
        </Reveal>
      ))}
    </div>
  );
}

function CatalogRail({ row }: { row: CatalogRowView }) {
  const railRef = useRef<HTMLUListElement>(null);

  function nudge(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <section aria-labelledby={`row-${slugify(row.category)}`}>
      <div className="flex items-end justify-between gap-4">
        <h3
          id={`row-${slugify(row.category)}`}
          className="font-display text-xl font-bold tracking-tight text-forest md:text-2xl"
        >
          {row.category}
        </h3>
        <div className="hidden shrink-0 gap-2 md:flex">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label={`Scroll ${row.category} left`}
            className="grid size-9 place-items-center rounded-full border border-sand bg-surface text-forest transition hover:border-accent"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label={`Scroll ${row.category} right`}
            className="grid size-9 place-items-center rounded-full border border-sand bg-surface text-forest transition hover:border-accent"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <ul
        ref={railRef}
        className="vu-rail mt-4 flex gap-4 overflow-x-auto pb-2"
        tabIndex={0}
        aria-label={`${row.category} classes`}
      >
        {row.courses.map((course) => (
          <li key={course.slug} className="w-[16rem] shrink-0 sm:w-[18rem]">
            <CatalogCard course={course} />
          </li>
        ))}
        <li className="w-[16rem] shrink-0 sm:w-[18rem]">
          <div className="vu-card vu-lift flex h-full min-h-[15rem] flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="font-display text-lg font-bold text-forest">
              …and many more
            </p>
            <p className="text-xs leading-relaxed text-foreground-muted">
              This is a sample of the {row.category.toLowerCase()} shelf, not the
              whole library.
            </p>
          </div>
        </li>
      </ul>
    </section>
  );
}

function CatalogCard({ course }: { course: CatalogCardView }) {
  const [playing, setPlaying] = useState(false);

  return (
    <article className="vu-card vu-lift flex h-full flex-col overflow-hidden p-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[1rem] bg-mint/60">
        {playing && course.teaserVideoUrl ? (
          <video
            src={course.teaserVideoUrl}
            controls
            autoPlay
            playsInline
            className="size-full object-cover"
            onEnded={() => setPlaying(false)}
          />
        ) : (
          <>
            {course.coverUrl ? (
              // Media-library URLs are arbitrary hosts, not optimizer inputs.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.coverUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <div
                data-asset-needed={`course-${course.slug}`}
                className="flex size-full items-center justify-center px-4 text-center"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-olive">
                  Dish photo needed
                </p>
              </div>
            )}
            {course.teaserVideoUrl ? (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="absolute inset-0 grid place-items-center bg-forest/25 transition hover:bg-forest/35"
                aria-label={`Play the teaser for ${course.title}`}
              >
                <span className="grid size-12 place-items-center rounded-full bg-white/95 text-forest shadow-lg">
                  <Play className="size-5 translate-x-px" aria-hidden />
                </span>
              </button>
            ) : null}
          </>
        )}
      </div>
      <div className="flex flex-1 flex-col px-1 pt-3">
        {course.liveAt ? (
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
            Live{" "}
            {new Date(course.liveAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        ) : null}
        <h4 className={cn("font-display text-base font-bold leading-snug text-forest")}>
          {course.title}
        </h4>
        {course.description ? (
          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-foreground-muted">
            {course.description}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
