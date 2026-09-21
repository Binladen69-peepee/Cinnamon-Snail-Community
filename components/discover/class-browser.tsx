"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChefHat, Clock, MessageSquare, Play, X } from "lucide-react";
import { playingEmbedSrc } from "@/lib/marketing/class-library";
import type { DiscoverClass } from "@/lib/community/discover";
import { cn } from "@/lib/utils";

/**
 * The class grid, and the panel a class opens into.
 *
 * `/learn/[slug]` is Phase 7 and does not exist yet, so a card that linked
 * there would 404 fifty-two times over. Until it lands, a class opens in place:
 * the still, the teaser, the description and a way into the room where classes
 * are discussed. When the route exists, this panel's footer link becomes the
 * card's href and the panel can go.
 */
export function ClassBrowser({
  classes,
  discussHref,
}: {
  classes: DiscoverClass[];
  /** The course room, when the viewer can see one. */
  discussHref: string | null;
}) {
  const [open, setOpen] = useState<DiscoverClass | null>(null);

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {classes.map((cls) => (
          <li key={cls.slug}>
            <ClassCard cls={cls} onOpen={() => setOpen(cls)} />
          </li>
        ))}
      </ul>

      {open ? (
        <ClassPanel
          cls={open}
          discussHref={discussHref}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function ClassCard({
  cls,
  onOpen,
}: {
  cls: DiscoverClass;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col overflow-hidden rounded-card border border-border bg-surface text-left transition hover:border-hairline-firm hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-brand-wash">
        {cls.photo ? (
          // Class stills come from the client's own media host, not the optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cls.photo}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid size-full place-items-center text-brand-strong/40">
            <ChefHat className="size-8" aria-hidden />
          </span>
        )}

        {cls.teaserEmbed ? (
          <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/25">
            <span className="grid size-10 place-items-center rounded-full bg-white/90 text-brand-strong opacity-0 shadow-e2 transition group-hover:opacity-100">
              <Play className="size-4 translate-x-px fill-current" aria-hidden />
            </span>
          </span>
        ) : null}

        {cls.length ? (
          <span className="absolute bottom-2 right-2 rounded-chip bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            {cls.length}
          </span>
        ) : null}
      </span>

      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-[14px] font-bold leading-snug text-foreground">
          {cls.title}
        </span>
        {cls.category ? (
          <span className="mt-auto pt-1 text-[11.5px] font-semibold text-foreground-muted">
            {cls.category}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function ClassPanel({
  cls,
  discussHref,
  onClose,
}: {
  cls: DiscoverClass;
  discussHref: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-[680px] overflow-y-auto rounded-t-modal bg-background shadow-e3 sm:rounded-modal"
      >
        <div className="relative aspect-video w-full bg-black">
          {playing && cls.teaserEmbed ? (
            <iframe
              src={playingEmbedSrc(cls.teaserEmbed)}
              title={`${cls.title} teaser`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="size-full"
            />
          ) : (
            <>
              {cls.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cls.photo}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center bg-brand-wash text-brand-strong/40">
                  <ChefHat className="size-10" aria-hidden />
                </span>
              )}
              {cls.teaserEmbed ? (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  className="absolute inset-0 grid place-items-center bg-black/25 transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                >
                  <span className="grid size-14 place-items-center rounded-full bg-white/95 text-brand-strong shadow-e2">
                    <Play className="size-6 translate-x-0.5 fill-current" aria-hidden />
                  </span>
                  <span className="sr-only">Play the {cls.title} teaser</span>
                </button>
              ) : null}
            </>
          )}

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2.5 top-2.5 grid size-9 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          <div>
            <h2
              id={titleId}
              className="font-display text-[1.3rem] font-bold leading-tight tracking-[-0.02em] text-foreground"
            >
              {cls.title}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-semibold text-foreground-muted">
              {cls.category ? <span>{cls.category}</span> : null}
              {cls.instructor ? (
                <span className="inline-flex items-center gap-1">
                  <ChefHat className="size-3" aria-hidden />
                  {cls.instructor}
                </span>
              ) : null}
              {cls.length ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="size-3" aria-hidden />
                  {cls.length} teaser
                </span>
              ) : null}
            </p>
          </div>

          {cls.description ? (
            <p className="text-[14px] leading-relaxed text-foreground-muted">
              {cls.description}
            </p>
          ) : null}

          {discussHref ? (
            <Link
              href={discussHref}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-ctl bg-brand-strong px-4 text-[14px] font-semibold text-white no-underline transition hover:bg-deep-forest",
              )}
            >
              <MessageSquare className="size-4" aria-hidden />
              Talk about this class
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
