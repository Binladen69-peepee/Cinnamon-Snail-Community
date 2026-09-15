import { cn } from "@/lib/utils";

/**
 * Dark forest wash over the hero photograph. Extracted so the slideshow can
 * sit the same scrim *above* every slide — the copy stays readable while
 * plates swap underneath.
 */
export function HeroScrim() {
  return (
    <>
      {/* Scrim, in two directions, because the copy sits bottom-left.
          Bottom-weighted for the headline and CTA, left-weighted for the
          column, and both fade out well before the top right so the bowl of
          hummus stays a photograph rather than a texture. The tone is a very
          dark forest rather than the brand's mid green: over magenta and
          radicchio a lighter green mixes to brown. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_top,rgba(7,27,23,0.92)_0%,rgba(7,27,23,0.74)_24%,rgba(7,27,23,0.34)_56%,rgba(7,27,23,0.12)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(7,27,23,0.74)_0%,rgba(7,27,23,0.52)_34%,rgba(7,27,23,0.2)_62%,rgba(7,27,23,0)_84%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(125%_100%_at_62%_18%,transparent_44%,rgba(4,18,14,0.42)_100%)]"
      />
    </>
  );
}

/**
 * Full-bleed hero photograph.
 *
 * This replaces the background video, and deliberately does not inherit its
 * treatment. The video needed a heavy four-stop scrim because nobody could
 * know which frame the headline would land on, plus film grain to stop flat
 * compressed areas looking cheap, plus a saturation bump to undo what the
 * codec took out. A photograph we can actually look at needs none of that:
 * the scrim is placed where the copy is rather than smeared across everything,
 * and the food keeps its own colour.
 *
 * It is also a server component. The video shipped an IntersectionObserver, a
 * connection check and a playback state machine; a photo needs no JavaScript
 * whatsoever, and being the LCP element it is fetched eagerly at high priority
 * instead of being deferred until the hero scrolled into view.
 *
 * Framing: the source is a 1200x1800 overhead flat-lay — Adam's food
 * photography is all shot portrait for recipe pages, so a wide band is always
 * a crop. A flat-lay is the one composition where that costs nothing: there is
 * no subject to cut in half, and every horizontal slice is full of food.
 * `object-position` favours the upper third, which puts the beet greens behind
 * the headline column and the bowl out to the right of it.
 */
export function HeroImage({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      {/* Painted under the photo so the headline always has a ground, even in
          the moment before the image decodes — and if the media library is
          unreachable, the hero degrades to this rather than to white. */}
      <div aria-hidden className="absolute inset-0 bg-[#071b17]" />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        // The LCP element: never lazy, and asked for ahead of the scripts.
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="vu-hero-photo size-full object-cover object-[50%_45%]"
      />

      <HeroScrim />
    </div>
  );
}
