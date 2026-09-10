"use client";

import { useEffect, useRef, useState } from "react";
import { CHECKOUT_LABEL, CHECKOUT_URL } from "@/lib/marketing/checkout";

/**
 * Sticky "Become a member" bar for mobile. Hidden until the visitor scrolls
 * past the hero, so it never covers the headline it is selling.
 */
export function StickyCheckout() {
  const [visible, setVisible] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: "-120px 0px 0px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px w-full" />
      <div
        className={`fixed inset-x-0 bottom-0 z-40 px-4 pb-4 transition-all duration-300 md:hidden ${
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
          className="vu-cta-fill flex h-13 items-center justify-center rounded-full text-base font-semibold no-underline shadow-[0_10px_30px_rgba(15,61,50,0.28)]"
        >
          {CHECKOUT_LABEL}
        </a>
      </div>
    </>
  );
}
