import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("flex min-h-11 items-center gap-2 text-forest", className)}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-7 shrink-0"
        aria-hidden
        fill="none"
      >
        <path
          d="M12 21c-4.4-2.4-7.5-6.3-7.5-11.1C4.5 6 7.2 3.5 12 3.5S19.5 6 19.5 9.9C19.5 14.7 16.4 18.6 12 21Z"
          fill="#16A34A"
        />
        <path
          d="M12 21V8.5"
          stroke="#0F3D32"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M12 12.2c1.8-1.6 3.7-2.2 5.6-2.3"
          stroke="#0F3D32"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-base font-bold tracking-tight sm:text-lg">
        Vegan University
      </span>
    </Link>
  );
}
