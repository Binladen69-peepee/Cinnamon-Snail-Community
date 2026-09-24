import { BookOpen, Heart, Utensils } from "lucide-react";
import { PhotoSlot } from "@/components/marketing/photo-slot";
import { Reveal } from "@/components/marketing/reveal";
import { PILLAR_CARDS } from "@/lib/marketing/copy";
import { cn } from "@/lib/utils";

const PILLAR_ICONS = [BookOpen, Utensils, Heart] as const;

/**
 * Homepage "What you get" — Learn / Cook / Belong as one editorial spread,
 * not three identical stacked cards. Copy and photo slots stay the signed-off
 * pillar data; this only changes how they sit on the page.
 */
export function WhatYouGet() {
  return (
    <section aria-labelledby="what-you-get-heading" className="relative">
      <Reveal>
        <p className="vu-kicker">What you get</p>
        <h2
          id="what-you-get-heading"
          className="vu-title-script-sm vu-headline mt-3 text-foreground"
        >
          <span className="vu-title-anim">Learn. Cook. Belong.</span>
        </h2>
      </Reveal>

      <div className="relative mt-10 overflow-hidden rounded-[2rem] border border-border bg-surface shadow-[var(--e2)]">
        {PILLAR_CARDS.map((pillar, index) => {
          const Icon = PILLAR_ICONS[index] ?? BookOpen;
          const photoRight = index === 1;

          return (
            <Reveal
              key={pillar.title}
              as="article"
              delay={index * 90}
              className={cn(
                "grid grid-cols-1 lg:grid-cols-2",
                index > 0 && "border-t border-border",
              )}
            >
              <div
                className={cn(
                  "relative min-h-[16rem] sm:min-h-[18rem] lg:min-h-[22rem]",
                  photoRight && "lg:order-2",
                )}
              >
                <div className="absolute inset-0">
                  <PhotoSlot
                    id={pillar.slotId}
                    aspect="h-full w-full"
                    rounded="rounded-none"
                  />
                </div>
                <span className="absolute left-4 top-4 grid size-10 place-items-center rounded-full bg-black/70 text-sm text-white backdrop-blur-sm">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>

              <div
                className={cn(
                  "relative flex flex-col justify-center px-5 py-8 sm:px-7 sm:py-10 md:px-12 md:py-14",
                  photoRight && "lg:order-1",
                )}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-2 top-4 hidden font-display text-8xl leading-none text-foreground/[0.06] md:block md:text-9xl"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
                  <Icon className="size-3.5" aria-hidden />
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="vu-title-script-sm mt-3 text-foreground">
                  {pillar.title}
                </h3>
                <p className="vu-measure mt-4 text-base leading-relaxed text-foreground-muted">
                  {pillar.body}
                </p>
                <span
                  aria-hidden
                  className="mt-8 h-px w-16 bg-foreground/20"
                />
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
