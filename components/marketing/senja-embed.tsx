"use client";

import { useEffect, useRef } from "react";

/**
 * Senja testimonial widget. These are the live, real testimonials — the sales
 * pages carry no hand-typed or hardcoded quotes.
 *
 * The widget script is injected per-widget id and reused if already present,
 * so mounting two different Senja widgets on one page does not load the
 * platform script twice.
 */
export function SenjaEmbed({
  widgetId,
  className,
  title,
}: {
  widgetId: string;
  className?: string;
  title?: string;
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
    <div className={className}>
      {title ? <span className="sr-only">{title}</span> : null}
      <div
        className="senja-embed"
        data-id={widgetId}
        data-mode="shadow"
        data-lazyload="false"
        style={{ display: "block", width: "100%" }}
      />
    </div>
  );
}

/** Homepage hero social proof, replacing the old avatar strip. */
export const SENJA_HOMEPAGE_WIDGET = "0cae9a7c-664f-42da-ab38-f51cea508770";

/** /membership social proof, sits after the heatmap and before pricing. */
export const SENJA_MEMBERSHIP_WIDGET = "07cdfa68-0281-43e5-bcd0-04286a530331";
