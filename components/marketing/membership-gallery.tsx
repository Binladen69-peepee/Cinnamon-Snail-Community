"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { MembershipSlide } from "@/lib/marketing/class-library";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

const HOLD = 4.2;
const FADE = 0.85;

/**
 * Membership photo slot: fifteen real class stills, same crop as the roast
 * it replaces. GSAP crossfades one plate at a time, pauses off-screen and
 * on hover, and skips motion when the visitor asked for less of it.
 */
export function MembershipGallery({ slides }: { slides: MembershipSlide[] }) {
  const root = useRef<HTMLDivElement>(null);
  const go = useRef<(dir: 1 | -1) => void>(() => {});

  useGSAP(
    () => {
      const el = root.current;
      if (!el || slides.length < 2) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      const layers = gsap.utils.toArray<HTMLElement>("[data-slide]", el);
      const count = layers.length;
      gsap.set(layers.slice(1), { autoAlpha: 0 });
      gsap.set(layers[0], { autoAlpha: 1 });

      let index = 0;
      let tween: gsap.core.Timeline | undefined;
      let wait: gsap.core.Tween | undefined;

      const show = (next: number) => {
        if (next === index) return;
        wait?.kill();
        tween?.kill();
        const current = index;
        tween = gsap.timeline({
          defaults: { duration: FADE, overwrite: "auto" },
          onComplete: () => {
            index = next;
            wait = gsap.delayedCall(HOLD, () => show((index + 1) % count));
          },
        });
        tween
          .to(layers[current], { autoAlpha: 0, ease: "power2.inOut" }, 0)
          .fromTo(
            layers[next],
            { autoAlpha: 0, scale: 1.04 },
            { autoAlpha: 1, scale: 1, ease: "power2.out" },
            0,
          );
      };

      wait = gsap.delayedCall(HOLD, () => show((index + 1) % count));
      go.current = (dir) => show((index + dir + count) % count);

      const io = new IntersectionObserver(
        ([entry]) => {
          const on = Boolean(entry?.isIntersecting);
          if (on) {
            wait?.resume();
            tween?.resume();
          } else {
            wait?.pause();
            tween?.pause();
          }
        },
        { threshold: 0.2 },
      );
      io.observe(el);

      const pause = () => {
        wait?.pause();
        tween?.pause();
      };
      const resume = () => {
        wait?.resume();
        tween?.resume();
      };
      el.addEventListener("pointerenter", pause);
      el.addEventListener("pointerleave", resume);

      return () => {
        io.disconnect();
        el.removeEventListener("pointerenter", pause);
        el.removeEventListener("pointerleave", resume);
      };
    },
    { scope: root, dependencies: [slides.length] },
  );

  if (slides.length === 0) return null;

  const total = String(slides.length).padStart(2, "0");

  return (
    <div
      ref={root}
      className="absolute inset-0 overflow-hidden bg-[#0f3d32]"
      role="region"
      aria-roledescription="carousel"
      aria-label="Classes in the library"
    >
      {slides.map((slide, index) => (
        <figure
          key={slide.title}
          data-slide
          className={cn(
            "absolute inset-0 m-0",
            index !== 0 && "invisible opacity-0",
          )}
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.photo}
            alt=""
            width={720}
            height={960}
            loading={index < 2 ? "eager" : "lazy"}
            decoding="async"
            className="size-full object-cover"
          />
          <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-5 pb-5 pr-24 pt-16">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/70">
              {String(index + 1).padStart(2, "0")} / {total}
            </p>
            <p className="mt-1.5 max-w-[28ch] text-sm leading-snug text-white md:text-base">
              {slide.title}
            </p>
          </figcaption>
        </figure>
      ))}

      {slides.length > 1 ? (
        <div className="absolute bottom-4 right-4 z-[2] flex gap-1.5">
          <button
            type="button"
            aria-label="Previous class"
            onClick={() => go.current(-1)}
            className="grid size-9 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/25 backdrop-blur-sm hover:bg-black/60"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next class"
            onClick={() => go.current(1)}
            className="grid size-9 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/25 backdrop-blur-sm hover:bg-black/60"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
