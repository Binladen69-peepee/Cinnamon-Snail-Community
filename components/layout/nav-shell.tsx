"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Sticky shell for the app bar.
 *
 * The bar itself is fully transparent so the hero video shows through behind
 * it. That only works while the thing behind it is the hero: once the page
 * scrolls, cream content passes underneath and light nav type would be
 * unreadable. So the shell reports whether the page has scrolled past the top
 * and `globals.css` restores the blurred surface and normal type from there on.
 *
 * The dark-hero type treatment is applied by CSS via
 * `body:has([data-hero-dark])`, so this component does not need to know which
 * page it is on.
 */
export function NavShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-app-nav
      data-scrolled={scrolled ? "true" : "false"}
      className="sticky top-0 z-40"
    >
      {children}
    </header>
  );
}
