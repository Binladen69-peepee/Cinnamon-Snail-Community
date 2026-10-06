"use client";

import { useEffect, useRef, useState } from "react";
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
 * elliptical wash on a layer *behind* the widget, inset well outwards so the
 * fade happens past the content rather than across it, with no border, no
 * shadow and no corner to catch the eye. Where the text is, it is opaque
 * enough to read against; at the edges it dissolves into whatever the page is
 * showing.
 *
 * The shape comes from two feather masks intersected, not from a gradient
 * background. A gradient can only fade along one axis: feathered across the
 * width it stays flat top-to-bottom, and the flat run then reads as a panel
 * with two hard vertical sides — which is exactly the box the client asked us
 * to remove, and what the first attempt at this still showed. Intersecting a
 * horizontal and a vertical feather rounds off all four sides at once, so
 * there is no straight edge anywhere for the eye to catch.
 *
 * `backdrop-filter` is deliberately not used: it clips to the element's
 * rectangle, which would draw back exactly the hard edge this removes.
 *
 * ## On the photograph (`onPhoto`)
 *
 * The homepage hero is a different problem. The widget there is one line of
 * type over a row of faces, sitting on the dark lower-left of the photograph,
 * which is dark in both themes. A light ground behind dark type there is a
 * white box however soft its edges are: the client asked for the white chip to
 * go (2026-10-06) and, before that, for the feathered wash to go, because on
 * the photograph it read as a glowing panel.
 *
 * So on the photograph nothing sits behind the widget except a faint glow, and
 * the widget's own type is turned white, the same white as the headline above
 * it, with the same soft shadow (`.vu-on-media`). The type is the only part
 * recoloured; the faces and their rings are left exactly as Senja draws them.
 * The box the chip occupied is kept, padding included, so nothing else in the
 * hero moves by a pixel.
 */

/**
 * A horizontal and a vertical feather, intersected by the caller.
 *
 * The stops sit at ~30/70 rather than nearer the edges so the falloff is long
 * and gradual: a short falloff reads as a panel with soft edges, which is
 * still a panel.
 */
const FEATHER = [
  "linear-gradient(to right, transparent 0%, #000 30%, #000 70%, transparent 100%)",
  "linear-gradient(to bottom, transparent 0%, #000 28%, #000 72%, transparent 100%)",
].join(", ");

/**
 * The faint glow behind the widget on the photograph. White at a few percent:
 * enough to lift the widget off the photograph as one object, far too little
 * to read as a panel. A literal rather than a token, because the photograph
 * under it is dark in both themes (DEC-064).
 */
const PHOTO_GLOW =
  "radial-gradient(closest-side, rgb(255 255 255 / 0.13), rgb(255 255 255 / 0.05) 58%, transparent 100%)";

/**
 * Senja draws into an open shadow root, which page CSS cannot reach, and sets
 * its text colour as a custom property inline on the widget's own root
 * (`--clr-text`). An `!important` declaration in a sheet adopted by that shadow
 * root outranks the inline one, and keeps doing so when the widget re-renders.
 */
const LIGHT_INK = `[style*="--clr-text"] { --clr-text: #ffffff !important; }`;

const inked = new WeakSet<ShadowRoot>();

/** Adds the light-ink sheet to a widget's shadow root, once. */
function applyLightInk(root: ShadowRoot) {
  if (inked.has(root)) return;
  inked.add(root);
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(LIGHT_INK);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  } catch {
    // Browsers without constructable stylesheets take a plain style element,
    // which the widget leaves alone because it is not one of its own nodes.
    const style = document.createElement("style");
    style.textContent = LIGHT_INK;
    root.appendChild(style);
  }
}

/** How long to wait for the widget to attach its shadow root. */
const INK_POLL_MS = 100;
const INK_POLL_LIMIT = 150;

export function SenjaEmbed({
  widgetId,
  className,
  title,
  wash = true,
  onPhoto = false,
}: {
  widgetId: string;
  className?: string;
  title?: string;
  /** Set false only where the widget already sits on a light, calm ground. */
  wash?: boolean;
  /**
   * Straight on the dark hero photograph: no ground at all, white type and a
   * faint glow. Takes precedence over `wash`.
   */
  onPhoto?: boolean;
}) {
  const mounted = useRef(false);
  const embedRef = useRef<HTMLDivElement>(null);
  const [inkReady, setInkReady] = useState(false);

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

  // Attaching a shadow root is not a DOM mutation an observer can see, so the
  // root is polled for briefly. The widget stays transparent until its type
  // has been turned white, so dark type never flashes on the photograph.
  useEffect(() => {
    if (!onPhoto) return;
    const host = embedRef.current;
    if (!host) return;
    let timer = 0;
    let attempts = 0;
    const attempt = () => {
      if (host.shadowRoot) {
        applyLightInk(host.shadowRoot);
        setInkReady(true);
        return;
      }
      attempts += 1;
      if (attempts < INK_POLL_LIMIT) timer = window.setTimeout(attempt, INK_POLL_MS);
    };
    attempt();
    return () => window.clearTimeout(timer);
  }, [onPhoto]);

  const embed = (
    <div
      ref={embedRef}
      className="senja-embed"
      data-id={widgetId}
      data-mode="shadow"
      data-lazyload="false"
      style={{ display: "block", width: "100%" }}
    />
  );

  if (onPhoto) {
    return (
      <div
        className={cn(
          // The chip's own box (24rem at most, 5px by 22px of padding), with
          // nothing painted in it.
          "vu-on-media relative isolate inline-block max-w-[min(100%,24rem)] px-5.5 py-1.25 text-white",
          className,
        )}
      >
        <div
          aria-hidden
          data-senja-glow
          className="pointer-events-none absolute -inset-x-10 -inset-y-6 -z-10"
          style={{ background: PHOTO_GLOW }}
        />
        <div
          className={cn(
            "relative transition-opacity duration-500 motion-reduce:transition-none",
            inkReady ? "opacity-100" : "opacity-0",
          )}
        >
          {title ? <span className="sr-only">{title}</span> : null}
          {embed}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {wash ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-40 -inset-y-24"
          style={{
            // Literal cream rather than the --paper token: the token inverts
            // to near-black in dark mode, which is the one thing this must
            // never do — the widget's own type is dark in both themes.
            backgroundColor: "color-mix(in oklab, var(--surface) 90%, transparent)",
            // Both feathers start well inside the negative inset, so the
            // widget's own text never sits on a partly-faded ground.
            maskImage: FEATHER,
            WebkitMaskImage: FEATHER,
            maskComposite: "intersect",
            // Safari still wants the prefixed keyword for the same operation.
            WebkitMaskComposite: "source-in",
          }}
        />
      ) : null}
      <div className="relative">
        {title ? <span className="sr-only">{title}</span> : null}
        {embed}
      </div>
    </div>
  );
}

/** Homepage hero social proof, replacing the old avatar strip. */
export const SENJA_HOMEPAGE_WIDGET = "0cae9a7c-664f-42da-ab38-f51cea508770";

/** /membership social proof, sits after the heatmap and before pricing. */
export const SENJA_MEMBERSHIP_WIDGET = "07cdfa68-0281-43e5-bcd0-04286a530331";
