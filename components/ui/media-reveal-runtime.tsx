"use client";

import { useEffect } from "react";

/**
 * The reveal half of `MediaFrame`, mounted once for the whole app.
 *
 * One IntersectionObserver serves every photo on the page. Frames announce
 * themselves with `data-media-reveal`; this marks each one `data-revealed`
 * the first time it crosses into view and then stops watching it. A feed that
 * appends fifty more photos costs no additional observers — a MutationObserver
 * hands the new frames to the same one.
 *
 * The opacity-0 starting state is gated on `data-media-runtime="on"`, which is
 * set here on mount. So if this never runs — JS disabled, a hydration failure,
 * a crawler — photographs simply render, rather than staying invisible forever.
 */
export function MediaRevealRuntime() {
  useEffect(() => {
    const root = document.documentElement;

    // No observer means no way to tell when a photo arrives on screen. Showing
    // everything at once is the right failure: the page is still correct, it
    // just does not animate.
    if (typeof IntersectionObserver === "undefined") return;

    root.dataset.mediaRuntime = "on";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = "true";
          observer.unobserve(entry.target);
        }
      },
      // Starts a touch before the frame is strictly on screen, so the settle
      // finishes about when the reader's eye arrives rather than after it.
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );

    const scan = (scope: ParentNode) => {
      const frames = scope.querySelectorAll<HTMLElement>(
        "[data-media-reveal]:not([data-revealed])",
      );
      for (const frame of frames) observer.observe(frame);
    };

    scan(document);

    // Client navigation and infinite feeds both add frames after mount.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const element = node as HTMLElement;
          if (element.matches("[data-media-reveal]:not([data-revealed])")) {
            observer.observe(element);
          }
          scan(element);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      delete root.dataset.mediaRuntime;
    };
  }, []);

  return null;
}
