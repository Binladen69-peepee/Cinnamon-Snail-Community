"use client";

import { useEffect, useRef, useState } from "react";
import { HeroScrim } from "@/components/marketing/hero-image";
import type { HeroDish } from "@/lib/marketing/class-library";
import { cn } from "@/lib/utils";

const HOLD_MS = 5500;

/**
 * One full-bleed hero plate at a time. The next photograph slides in from the
 * bottom-right until it covers the last, then rests. Thumbs in that same
 * corner pick a slide. Stills are the client hero photo plus spreadsheet
 * class plates — never stock.
 */
export function HeroSlideshow({ slides }: { slides: HeroDish[] }) {
  const [{ active, outgoing }, setSlide] = useState<{
    active: number;
    outgoing: number | null;
  }>({ active: 0, outgoing: null });

  const count = slides.length;
  const firstPaint = useRef(true);

  useEffect(() => {
    if (count < 2) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hold = reduced.matches ? 8000 : HOLD_MS;
    const id = window.setInterval(() => {
      setSlide((slide) => {
        if (slide.outgoing !== null) return slide;
        const next = (slide.active + 1) % count;
        return { active: next, outgoing: slide.active };
      });
    }, hold);
    return () => window.clearInterval(id);
  }, [count, active]);

  if (count === 0) return null;

  const current = slides[active];
  const previous = outgoing !== null ? slides[outgoing] : null;
  if (!current) return null;

  function select(index: number) {
    setSlide((slide) => {
      if (index === slide.active || slide.outgoing !== null) return slide;
      return { active: index, outgoing: slide.active };
    });
  }

  function settle() {
    firstPaint.current = false;
    setSlide((slide) =>
      slide.outgoing === null ? slide : { ...slide, outgoing: null },
    );
  }

  return (
    <>
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[#071b17]" />

        {previous ? (
          <figure className="vu-hero-slide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previous.photo}
              alt=""
              className="size-full object-cover object-[50%_45%]"
            />
          </figure>
        ) : null}

        <figure
          className={cn(
            "vu-hero-slide",
            outgoing !== null && "vu-hero-slide-in",
            firstPaint.current && outgoing === null && active === 0 && "vu-hero-photo",
          )}
          onAnimationEnd={settle}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.photo}
            alt=""
            loading={active === 0 ? "eager" : "lazy"}
            fetchPriority={active === 0 ? "high" : "auto"}
            decoding="async"
            className="size-full object-cover object-[50%_45%]"
          />
        </figure>

        <HeroScrim />
      </div>

      {count > 1 ? (
        <div
          role="group"
          aria-label="Hero dishes"
          className="absolute bottom-5 right-4 z-20 sm:bottom-7 sm:right-6 md:bottom-8 md:right-8"
        >
          <div className="flex gap-1.5 rounded-[1.05rem] bg-black/40 p-1.5 ring-1 ring-white/25 backdrop-blur-md sm:gap-2 sm:p-2">
            {slides.map((dish, index) => {
              const currentSlide = index === active;
              return (
                <button
                  key={`${dish.photo}-${index}`}
                  type="button"
                  aria-current={currentSlide ? "true" : undefined}
                  aria-label={dish.title || `Dish ${index + 1}`}
                  onClick={() => select(index)}
                  className={cn(
                    "relative size-11 overflow-hidden rounded-[0.7rem] sm:size-12 md:size-[3.25rem]",
                    currentSlide
                      ? "ring-2 ring-[#FFF8EF] ring-offset-2 ring-offset-black/40"
                      : "opacity-70 ring-1 ring-white/20 hover:opacity-100",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dish.photo}
                    alt=""
                    className="size-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
