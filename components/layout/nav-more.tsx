"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";

export function NavMore({
  items,
  align = "center",
}: {
  items: { href: string; label: string }[];
  align?: "center" | "end";
}) {
  if (items.length === 0) return null;

  return (
    <details className="relative shrink-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-full px-3 text-sm font-medium text-foreground hover:bg-sage hover:text-forest open:bg-sage [&::-webkit-details-marker]:hidden">
        More
        <ChevronDown className="size-3.5 opacity-70" aria-hidden />
      </summary>
      <nav
        className={`vu-card absolute top-[calc(100%+0.5rem)] z-50 w-52 py-2 text-sm font-medium ${
          align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
        }`}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block whitespace-nowrap px-4 py-2.5 text-foreground hover:bg-mint hover:text-forest"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </details>
  );
}
