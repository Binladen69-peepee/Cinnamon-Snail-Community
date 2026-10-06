"use client";

import Link from "next/link";
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, SectionHeader } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * One shelf of the class library: a heading and a single row of classes that
 * scrolls sideways.
 *
 * A row per category is what a class portal is — every shelf visible at once,
 * one swipe to see more of the one you care about, and "See all" for the
 * shelf's own grid. On a phone the row runs to the screen edge and the next
 * card peeks in, which is the cue that it scrolls; cards snap to the gutter.
 * From `md` up there are previous/next buttons beside the heading, because a
 * mouse has no sideways swipe. They only appear when the row overflows, and
 * they are plain buttons: the row itself stays a list of links that a
 * keyboard tabs through, scrolling each into view as it goes.
 *
 * The tiles are rendered on the server and handed in as children; each is
 * wrapped in a list item here so the widths and the snap stay in one place.
 */
export function ClassShelf({
  title,
  count,
  description,
  seeAllHref,
  children,
}: {
  title: string;
  count?: number;
  description?: string | null;
  /** The shelf's own grid. Omitted for a shelf that has no page. */
  seeAllHref?: string;
  /** One element per class, each with a key. */
  children: ReactNode;
}) {
  const headingId = useId();
  const rowRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const row = rowRef.current;
    // Without a ResizeObserver the row still scrolls by touch and trackpad;
    // it just never offers the buttons.
    if (!row || typeof ResizeObserver === "undefined") return;
    function measure() {
      const el = rowRef.current;
      if (!el) return;
      const room = el.scrollWidth - el.clientWidth;
      const start = el.scrollLeft <= 4;
      const end = el.scrollLeft >= room - 4;
      setEdges((previous) =>
        previous.start === start && previous.end === end ? previous : { start, end },
      );
    }
    // A ResizeObserver reports once as soon as it starts observing, which is
    // the first measurement; after that, a resize or a scroll re-measures.
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    row.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      row.removeEventListener("scroll", measure);
    };
  }, []);

  function page(direction: 1 | -1) {
    const row = rowRef.current;
    if (!row) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({
      left: direction * row.clientWidth * 0.9,
      behavior: still ? "auto" : "smooth",
    });
  }

  const overflows = !(edges.start && edges.end);
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <SectionHeader
        title={<span id={headingId}>{title}</span>}
        count={count}
        description={description ?? undefined}
        action={
          seeAllHref || overflows ? (
            <>
              {seeAllHref ? (
                <Link
                  href={seeAllHref}
                  className="rounded-ctl px-1 text-label font-medium text-brand-strong no-underline hover:underline"
                >
                  See all
                  <span className="sr-only"> {title}</span>
                </Link>
              ) : null}
              {overflows ? (
                <span className="hidden items-center gap-1 md:inline-flex">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => page(-1)}
                    disabled={edges.start}
                    aria-label={`Scroll ${title} back`}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => page(1)}
                    disabled={edges.end}
                    aria-label={`Scroll ${title} forward`}
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </span>
              ) : null}
            </>
          ) : undefined
        }
      />

      <ul
        ref={rowRef}
        className={cn(
          // A scrolling row clips on both axes, so it carries a little room of
          // its own (given back with negative margins) for the focus ring and
          // the cards' hover shadow.
          "vu-scroll-x -mb-3 -mt-1 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 pt-1 md:snap-proximity",
          // Edge to edge on a phone, so the next card peeks in from the side;
          // back inside the column once there is room for the buttons.
          "-mx-4 scroll-px-4 px-4 sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6 lg:-mx-2 lg:scroll-px-2 lg:px-2",
        )}
      >
        {items.map((item, index) => (
          <li
            key={item.key ?? index}
            className="w-[44%] shrink-0 snap-start sm:w-[30%] lg:w-[23%] xl:w-[18.5%]"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
