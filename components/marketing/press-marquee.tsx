import { PRESS_CREDITS } from "@/lib/marketing/assets";

/**
 * Slow "featured in" ticker. Every credit is verifiable from Adam's own about
 * page. The list is duplicated once so the CSS translate loop is seamless; the
 * copy is aria-hidden so screen readers hear each credit once.
 */
export function PressMarquee({ label = "Featured in" }: { label?: string }) {
  return (
    <section aria-label={label} className="vu-marquee-wrap border-y border-sand/70 py-5">
      <p className="sr-only">
        {label}: {PRESS_CREDITS.join(", ")}
      </p>
      <div className="vu-marquee">
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            aria-hidden={copy === 1 ? true : undefined}
            className="vu-marquee-track"
          >
            {PRESS_CREDITS.map((credit) => (
              <li
                key={`${copy}-${credit}`}
                className="flex shrink-0 items-center gap-8 whitespace-nowrap font-display text-sm font-bold uppercase tracking-[0.2em] text-olive"
              >
                {credit}
                <span aria-hidden className="size-1.5 rounded-full bg-accent/60" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
