"use client";

import { Avatar as HeroAvatar } from "@heroui/react/avatar";
import { cn } from "@/lib/utils";

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
    <HeroAvatar
      size={size}
      color="accent"
      variant="soft"
      className={cn("shrink-0", className)}
    >
      {src ? <HeroAvatar.Image src={src} alt="" /> : null}
      <HeroAvatar.Fallback>{initials}</HeroAvatar.Fallback>
    </HeroAvatar>
  );
}
