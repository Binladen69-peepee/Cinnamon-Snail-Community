"use client";

import { useEffect, useState } from "react";
import { CHECKOUT_LABEL, CHECKOUT_URL } from "@/lib/marketing/checkout";

/**
 * Sticky "Become a member" bar for phones.
 *
 * It appears once the hero has scrolled out of view and not before. The
 * previous version watched a one-pixel sentinel placed *after* the hero: at
 * the top of the page that sentinel was below the fold, so it was "not
 * intersecting" and the bar showed immediately — stacked on top of the hero's
 * own button, which is the one thing it must never cover.
 *
 * The hero is found by the same attribute the nav uses to know it is over a
 * dark photograph, so pages without one fall back to showing the bar after a
 * short scroll.
 */
export function StickyCheckout() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>("[data-hero-dark]");
    if (hero) {
      const observer = new IntersectionObserver(
        ([entry]) => setVisible(!entry.isIntersecting),
        { threshold: 0 },
      );
      observer.observe(hero);
      return () => observer.disconnect();
    }
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-300 md:hidden ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <a
        href={CHECKOUT_URL}
        data-samcart-checkout
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        className="vu-cta-fill flex h-13 items-center justify-center rounded-full text-base font-semibold no-underline shadow-[0_10px_30px_rgba(0,0,0,0.28)]"
      >
        {CHECKOUT_LABEL}
      </a>
    </div>
  );
}
