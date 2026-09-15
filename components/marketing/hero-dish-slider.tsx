"use client";

import { useEffect, useState } from "react";
import type { HeroDish } from "@/lib/marketing/class-library";
import { cn } from "@/lib/utils";

const DRIFT_MS = 24000;
const DOCK_SIZE = 4;

/**
 * Hero dish slider: a dock of real class stills at the bottom-right, and the
 * same plates gliding bottom-right → top-left across the photograph. Photos
 * come from the spreadsheet library — never stock. Motion is CSS; JS only
 * keeps the four-up dock in step with the loop.
 */
export function HeroDishSlider({ dishes }: { dishes: HeroDish[] }) {
  const [active, setActive] = useState(0);
  const count = dishes.length;

  useEffect(() => {
    if (count === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const started = Date.now();
    const slotMs = DRIFT_MS / count;
    const tick = () => {
      setActive(Math.floor(((Date.now() - started) / slotMs) % count));
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [count]);

  if (count === 0) return null;

  const dock = Array.from({ length: Math.min(DOCK_SIZE, count) }, (_, offset) => {
    const index = (active + offset) % count;
    return { dish: dishes[index]!, index, current: offset === 0 };
  });

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
        aria-hidden
      >
        {dishes.map((dish, index) => (
          <figure
            key={dish.title}
            className="vu-hero-drift"
            style={{
              animationDelay: `${(-index * (DRIFT_MS / count)) / 1000}s`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dish.photo} alt="" />
          </figure>
        ))}
      </div>

      <div
        role="group"
        aria-label="Dishes from the class library"
        className="absolute bottom-5 right-4 z-20 sm:bottom-7 sm:right-6 md:bottom-8 md:right-8"
      >
        <div className="flex gap-1.5 rounded-[1.05rem] bg-black/40 p-1.5 ring-1 ring-white/25 backdrop-blur-md sm:gap-2 sm:p-2">
          {dock.map(({ dish, current }) => (
            <div
              key={dish.title}
              aria-current={current ? "true" : undefined}
              className={cn(
                "relative size-12 overflow-hidden rounded-[0.7rem] sm:size-14 md:size-16",
                current
                  ? "ring-2 ring-[#FFF8EF] ring-offset-2 ring-offset-black/40"
                  : "opacity-75 ring-1 ring-white/20",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dish.photo}
                alt={dish.title}
                className="size-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
