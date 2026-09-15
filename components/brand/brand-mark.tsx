import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The Vegan University mark: a forest roundel around a botanical leaf.
 *
 * The leaf is a bay/laurel — culinary, not a generic Lucide glyph. Petiole,
 * ovate blade, midrib and pinnate veins so it reads as a real leaf at 32px.
 *
 * In dark mode the roundel is cream, so the leaf flips to the page ground
 * rather than vanishing into the disc.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Vegan University"
    >
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

      {/* Petiole */}
      <path
        d="M13.2 30.4c2.1-3.4 3.6-6.6 4.6-9.2"
        className="stroke-accent dark:stroke-[var(--background)]"
        fill="none"
        strokeWidth="1.35"
        strokeLinecap="round"
      />

      {/* Blade, slightly turned — one face of a bay leaf */}
      <path
        d="M17.6 21.4
           C12.4 19.6 9.6 14.8 11.3 9.8
           C12.8 5.4 18.2 3.6 23.4 6.2
           C28.8 9.1 30.6 15.4 27.2 20.4
           C24.6 24.2 20.8 24.4 17.6 21.4Z"
        className="fill-accent dark:fill-[var(--background)]"
      />
      {/* Near-edge highlight so the blade has a face, not a flat glyph */}
      <path
        d="M18.4 20.2
           C14.6 18.6 12.8 14.6 14.1 10.6
           C15.2 7.2 19.2 5.8 23 7.8
           C22.2 8.6 18.8 12.4 18.4 20.2Z"
        className="fill-paper/35 dark:fill-forest/25"
      />

      {/* Midrib */}
      <path
        d="M18.2 21.2C20.4 16.2 22.2 11.4 24.4 7.2"
        className="stroke-forest/55 dark:stroke-accent/70"
        fill="none"
        strokeWidth="0.85"
        strokeLinecap="round"
      />
      {/* Pinnate veins */}
      <path
        d="M19.2 18.6c1.8-1.1 3.4-1.4 5.1-.6M20.1 15.6c1.6-1.2 3.2-1.5 4.8-.7M21.1 12.6c1.4-1.1 2.8-1.4 4.2-.8M22.1 9.8c1.1-.9 2.2-1.1 3.3-.6"
        className="stroke-forest/40 dark:stroke-accent/55"
        fill="none"
        strokeWidth="0.55"
        strokeLinecap="round"
      />
      <path
        d="M19.6 17.8c-1.6-1.4-2.4-2.8-2.2-4.6M20.6 14.6c-1.5-1.4-2.2-2.8-1.9-4.4M21.6 11.6c-1.2-1.2-1.8-2.4-1.6-3.8"
        className="stroke-forest/35 dark:stroke-accent/45"
        fill="none"
        strokeWidth="0.5"
        strokeLinecap="round"
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
        <span className="vu-wordmark hidden flex-col leading-none sm:flex">
          <span className="vu-wordmark-name">Vegan University</span>
          <span className="vu-wordmark-tag">Cooking school</span>
        </span>
      ) : null}
    </Link>
  );
}
