"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Senja testimonial widget. These are the live, real testimonials — the sales
 * pages carry no hand-typed or hardcoded quotes.
 *
 * The widget script is injected per-widget id and reused if already present,
 * so mounting two different Senja widgets on one page does not load the
 * platform script twice.
 *
 * ## The wash
 *
 * Senja renders its own light-themed content — dark type, light cards — and we
 * do not control it. That is fine on the cream page background in light mode
 * and unreadable everywhere else: over the hero photograph, and on the
 * near-black page background in dark mode.
 *
 * It used to be solved with a cream card: a rounded panel with padding and a
 * big drop shadow. That read as a separate floating object bolted onto the
 * page, which is what the client asked us to remove.
 *
 * So the light ground is still here, but it is no longer a box. It is a soft
 * elliptical wash on a layer *behind* the widget, inset outwards so the fade
 * happens past the content rather than across it, with no border, no shadow
 * and no corner to catch the eye. Where the text is, it is opaque enough to
 * read against; at the edges it dissolves into whatever the page is showing.
 *
 * `backdrop-filter` is deliberately not used: it clips to the element's
 * rectangle, which would draw back exactly the hard edge this removes.
 */
export function SenjaEmbed({
  widgetId,
  className,
  title,
  wash = true,
}: {
  widgetId: string;
  className?: string;
  title?: string;
  /** Set false only where the widget already sits on a light, calm ground. */
  wash?: boolean;
}) {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const src = `https://widget.senja.io/widget/${widgetId}/platform.js`;
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.type = "text/javascript";
    script.async = true;
    document.body.appendChild(script);
  }, [widgetId]);

  return (
    <div className={cn("relative", className)}>
      {wash ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-28 -inset-y-14"
          style={{
            // Literal cream rather than the --paper token: the token inverts
            // to near-black in dark mode, which is the one thing this must
            // never do — the widget's own type is dark in both themes.
            //
            // The two axes are feathered separately. A single radial gradient
            // cannot do this on a wide, short band: sized to fade across the
            // width it collapses the height, and sized to the height it stays
            // flat across the width, which just draws the rectangle back.
            // So the horizontal fade is the background and the vertical fade
            // is a mask over it. Both fades land in the negative inset, which
            // is why the widget itself never sits on a partly-faded ground.
            backgroundImage:
              "linear-gradient(to right, rgba(255,252,248,0) 0%, rgba(255,252,248,0.55) 8%, rgba(255,252,248,0.93) 17%, rgba(255,252,248,0.93) 83%, rgba(255,252,248,0.55) 92%, rgba(255,252,248,0) 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)",
          }}
        />
      ) : null}
      <div className="relative">
        {title ? <span className="sr-only">{title}</span> : null}
        <div
          className="senja-embed"
          data-id={widgetId}
          data-mode="shadow"
          data-lazyload="false"
          style={{ display: "block", width: "100%" }}
        />
      </div>
    </div>
  );
}

/** Homepage hero social proof, replacing the old avatar strip. */
export const SENJA_HOMEPAGE_WIDGET = "0cae9a7c-664f-42da-ab38-f51cea508770";

/** /membership social proof, sits after the heatmap and before pricing. */
export const SENJA_MEMBERSHIP_WIDGET = "07cdfa68-0281-43e5-bcd0-04286a530331";
