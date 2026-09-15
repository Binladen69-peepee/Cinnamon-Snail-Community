import Link from "next/link";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Same Lucide leaf as the "A vegan cooking school" hero tag — no roundel,
 * no extra drawing. The wordmark sits beside it.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Leaf
      className={cn("size-7 shrink-0", className)}
      aria-hidden
    />
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
      aria-label="Vegan University"
    >
      <BrandLogo className="transition-transform duration-300 group-hover:rotate-[-8deg]" />
      {showWordmark ? (
        <span className="vu-wordmark hidden flex-col leading-none sm:flex">
          <span className="vu-wordmark-name">Vegan University</span>
          <span className="vu-wordmark-tag">Cooking school</span>
        </span>
      ) : null}
    </Link>
  );
}
