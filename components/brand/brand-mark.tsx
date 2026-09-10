import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The Vegan University mark.
 *
 * Built from the leaf motif already running through the site, but composed as
 * an actual brand mark rather than a single generic leaf: a forest roundel
 * holds a sprig of three leaves growing from a stem, with the centre leaf
 * carrying a midrib. The roundel reads at favicon size, the sprig reads as
 * growth and teaching, and the whole thing sits on the same forest/accent
 * palette as everything else.
 *
 * Two leaves are the accent green and one is a lighter tint, so the mark keeps
 * some depth when it is rendered at 20px.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Vegan University"
    >
      {/* Roundel */}
      <circle cx="20" cy="20" r="19" className="fill-forest" />
      <circle
        cx="20"
        cy="20"
        r="19"
        fill="none"
        className="stroke-accent"
        strokeOpacity="0.35"
        strokeWidth="1"
      />

      {/* Stem */}
      <path
        d="M20 30.5V17.2"
        className="stroke-accent"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />

      {/* Left leaf */}
      <path
        d="M19.1 22.6c-3.4.5-5.9-1-6.7-4.2 3.1-1.3 5.8-.4 6.7 4.2Z"
        className="fill-accent"
        fillOpacity="0.62"
      />
      {/* Right leaf */}
      <path
        d="M20.9 19.4c3.4.5 5.9-1 6.7-4.2-3.1-1.3-5.8-.4-6.7 4.2Z"
        className="fill-accent"
        fillOpacity="0.62"
      />
      {/* Crown leaf, with a midrib */}
      <path
        d="M20 16.8c-2.6-2.1-2.6-5.4 0-8.3 2.6 2.9 2.6 6.2 0 8.3Z"
        className="fill-accent"
      />
      <path
        d="M20 15.4V10.2"
        className="stroke-forest"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />
    </svg>
  );
}

export function BrandMark({
  href,
  className,
  showWordmark = true,
}: {
  href: string;
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap text-forest no-underline",
        className,
      )}
    >
      <BrandLogo className="size-8 transition-transform duration-300 group-hover:rotate-[-6deg]" />
      {showWordmark ? (
        <span className="hidden flex-col leading-none sm:flex">
          <span className="font-display text-[0.95rem] font-bold tracking-tight">
            Vegan University
          </span>
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-olive">
            Cooking school
          </span>
        </span>
      ) : null}
    </Link>
  );
}
