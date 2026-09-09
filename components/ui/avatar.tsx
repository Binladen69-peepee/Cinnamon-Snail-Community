"use client";

import { useState } from "react";
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
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (src && !failed) {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 overflow-hidden rounded-full bg-sage",
          sizeClass[size],
          className,
        )}
      >
        {/* Local and remote member photos; next/image is not required for avatars. */}
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-sage font-semibold text-forest",
        sizeClass[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
