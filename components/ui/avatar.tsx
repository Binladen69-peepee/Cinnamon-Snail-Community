"use client";

import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "size-9 text-[11px]",
  md: "size-11 text-xs",
  lg: "size-16 text-base",
} as const;

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full bg-sage font-semibold text-forest",
        sizeClass[size],
        className,
      )}
    >
      {src ? (
        // Local member photos must render even if the image optimizer is skipped.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center">{initials}</span>
      )}
    </span>
  );
}
