import { PRESS_CREDITS } from "@/lib/marketing/assets";

/**
 * Pace and length, kept as they were when the list changes.
 *
 * The strip is copies of the credit list side by side, and the keyframes move
 * it by half its width per loop, so half the copies scroll past each cycle.
 * Two copies of the original seven credits were 1,587px a copy, wider than a
 * laptop screen, and 38s moved one of them: about 42px a second.
 *
 * Six credits make a copy about 1,200px, narrower than many screens. With
 * only two copies the end of each loop would show a blank stretch and then
 * jump, so there are four, which stays seamless up to about 2,370px (wider
 * than before), and the duration is worked out from the list so the strip
 * moves at the same 42px a second as it always has.
 *
 * Widths are measured from the live page: about 11.3px per character in this
 * face and tracking, and 70px per credit for its dot and the gaps around it.
 */
const COPIES = 4;
const PX_PER_CHARACTER = 11.3;
const PX_PER_CREDIT = 70;
const PX_PER_SECOND = 41.8;

const copyWidth = PRESS_CREDITS.reduce(
  (total, credit) => total + credit.length * PX_PER_CHARACTER + PX_PER_CREDIT,
  0,
);
const loopSeconds = ((COPIES / 2) * copyWidth) / PX_PER_SECOND;

/**
 * Slow "featured in" ticker. Every credit is verifiable from Adam's own about
 * page. The list is repeated so the CSS translate loop is seamless; the
 * repeats are aria-hidden so screen readers hear each credit once.
 */
export function PressMarquee({ label = "Featured in" }: { label?: string }) {
  return (
    <section aria-label={label} className="vu-marquee-wrap border-y border-sand/70 py-5">
      <p className="sr-only">
        {label}: {PRESS_CREDITS.join(", ")}
      </p>
      <div
        className="vu-marquee"
        style={{ animationDuration: `${loopSeconds.toFixed(1)}s` }}
      >
        {Array.from({ length: COPIES }, (_, copy) => (
          <ul
            key={copy}
            aria-hidden={copy > 0 ? true : undefined}
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
