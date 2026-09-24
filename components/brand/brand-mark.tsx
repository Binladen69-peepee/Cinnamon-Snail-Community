import Link from "next/link";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The leaf on its own, for places that only have room for the mark.
 */
export function BrandLogo({ className }: { className?: string }) {
  return <Leaf className={cn("size-7 shrink-0", className)} strokeWidth={2} aria-hidden />;
}

/**
 * The lockup: leaf and wordmark, on one fixed-height line.
 *
 * Both parts are centred on the same axis inside a 40px row, so the mark
 * lines up with the controls beside it in the bar instead of sitting a few
 * pixels high of them. The wordmark is short enough to show on a phone; only
 * the small tag line waits for a wider screen.
 *
 * Colour comes from the surrounding text so the nav's over-photo treatment
 * lifts it to white along with everything else in the bar.
 */
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
      data-brand
      aria-label="Vegan University"
      className={cn(
        "group inline-flex h-10 shrink-0 items-center gap-2.5 whitespace-nowrap text-foreground no-underline",
        className,
      )}
    >
      <BrandLogo className="size-7 transition-transform duration-300 group-hover:rotate-[-8deg]" />
      {showWordmark ? (
        <span className="vu-wordmark flex flex-col justify-center leading-none">
          <span className="vu-wordmark-name">Vegan University</span>
          <span className="vu-wordmark-tag hidden md:block">Cooking school</span>
        </span>
      ) : null}
    </Link>
  );
}
